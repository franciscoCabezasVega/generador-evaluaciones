"use client";

import { supabase } from "@/lib/supabase";
import { SessionStore } from "./SessionStore";

// ─── RefreshScheduler ─────────────────────────────────────────────────────────
//
// Refresca el token proactivamente 120 segundos antes de su expiración.
//
// DISEÑO:
//   • Un único setTimeout planificado por tab.
//   • Visibility-aware: pausa cuando el tab es hidden, recalcula al volver.
//   • Coordinación cross-tab con navigator.locks (ifAvailable: true):
//     si otra tab ya tiene el lock, esta NO refresca — solo escuchará el
//     TOKEN_REFRESHED que llegará vía onAuthStateChange → SessionStore.
//   • Circuit Breaker: 3 fallos consecutivos → fuerza signOut + redirect.
//
// ─────────────────────────────────────────────────────────────────────────────

const PROACTIVE_LEAD_MS = 120_000; // Refrescar 2 min antes de expirar
const MAX_CIRCUIT_FAILURES = 3;

class _RefreshScheduler {
  private _timerId: ReturnType<typeof setTimeout> | null = null;
  private _failures = 0;
  private _running = false;
  private _unsubscribeStore: (() => void) | null = null;

  /**
   * Arranca el scheduler. Llamar una vez desde el bootstrap del SessionStore.
   * Idempotente.
   */
  start(): void {
    if (this._running) return;
    this._running = true;

    // Reaccionar a cambios de sesión para re-planificar
    this._unsubscribeStore = SessionStore.subscribe((snapshot) => {
      if (snapshot.session) {
        this._schedule(snapshot.session.expires_at);
      } else {
        this._cancel();
      }
    });

    // Visibility-aware: recalcular al volver al tab
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this._onVisibility);
    }
  }

  stop(): void {
    this._cancel();
    this._unsubscribeStore?.();
    this._unsubscribeStore = null;
    this._running = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._onVisibility);
    }
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private _onVisibility = (): void => {
    if (document.visibilityState !== "visible") return;
    const session = SessionStore.getSession();
    if (session) {
      this._schedule(session.expires_at);
    }
  };

  private _schedule(expiresAt: number | undefined): void {
    this._cancel();
    if (!expiresAt) return;

    const now = Math.floor(Date.now() / 1000);
    const msUntilRefresh = (expiresAt - now) * 1000 - PROACTIVE_LEAD_MS;

    // Si ya pasó o queda menos de 5s → refrescar ya
    const delay = Math.max(msUntilRefresh, 5_000);

    this._timerId = setTimeout(() => this._performRefresh(), delay);
  }

  private _cancel(): void {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  private async _performRefresh(): Promise<void> {
    // No refrescar si el tab está oculto — re-planificar al volver visible.
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }

    // Circuit breaker: si hay demasiados fallos, forzar logout
    if (this._failures >= MAX_CIRCUIT_FAILURES) {
      console.warn(
        "[RefreshScheduler] Circuit breaker abierto: demasiados fallos de refresh, forzando logout.",
      );
      SessionStore.applySignOut();
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      if (typeof window !== "undefined") {
        window.location.href =
          "/auth/login?sessionExpired=true&reason=refresh_failed";
      }
      return;
    }

    // Coordinación cross-tab: solo refrescar si podemos adquirir el lock.
    // Si otra tab lo tiene, esta simplemente espera el TOKEN_REFRESHED de onAuthStateChange.
    try {
      await this._refreshWithLock();
    } catch (err) {
      const isLockUnavailable =
        err instanceof Error && err.message === "lock-unavailable";

      if (isLockUnavailable) {
        // Otra tab tiene el lock — esperar pasivamente el TOKEN_REFRESHED de onAuthStateChange.
        const session = SessionStore.getSession();
        if (session) {
          // Re-planificar en 30s para re-chequear si la otra tab refrescó
          this._timerId = setTimeout(() => this._performRefresh(), 30_000);
        }
      } else {
        // Excepción inesperada lanzada desde _doRefresh() (ej: supabase-js rechazó
        // la promesa en lugar de retornar { error }). Tratar como fallo real para
        // que el circuit breaker funcione correctamente.
        this._failures++;
        console.warn(
          `[RefreshScheduler] Excepción inesperada en refresh (fallo ${this._failures}/${MAX_CIRCUIT_FAILURES}):`,
          err,
        );
        const backoffMs = Math.min(30_000 * this._failures, 120_000);
        this._timerId = setTimeout(() => this._performRefresh(), backoffMs);
      }
    }
  }

  private async _refreshWithLock(): Promise<void> {
    // navigator.locks puede no estar disponible en todos los contextos
    if (typeof navigator === "undefined" || !navigator.locks) {
      await this._doRefresh();
      return;
    }

    let acquired = false;
    await navigator.locks.request(
      "supabase-token-refresh",
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          // No disponible — otra tab tiene el lock, lanzar para que el caller
          // sepa que no hay que reintentar.
          throw new Error("lock-unavailable");
        }
        acquired = true;
        await this._doRefresh();
      },
    );

    if (!acquired) {
      throw new Error("lock-unavailable");
    }
  }

  private async _doRefresh(): Promise<void> {
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      this._failures++;
      console.warn(
        `[RefreshScheduler] Error en refresh (fallo ${this._failures}/${MAX_CIRCUIT_FAILURES}):`,
        error.message,
      );
      // Re-planificar con back-off para no saturar la API
      const backoffMs = Math.min(30_000 * this._failures, 120_000);
      this._timerId = setTimeout(() => this._performRefresh(), backoffMs);
      return;
    }

    // Éxito — onAuthStateChange (TOKEN_REFRESHED) ya actualizará el SessionStore.
    // Sin embargo, llamamos applySession aquí como redundancia para casos
    // donde el evento llega tarde.
    this._failures = 0;
    if (data.session) {
      SessionStore.applySession(data.session);
      // Re-planificar para el próximo refresh
      this._schedule(data.session.expires_at);
    }
  }
}

export const RefreshScheduler = new _RefreshScheduler();
