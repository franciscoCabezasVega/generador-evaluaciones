"use client";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

export interface SessionSnapshot {
  session: Session | null;
  status: SessionStatus;
  updatedAt: number;
}

type Listener = (snapshot: SessionSnapshot) => void;

// ─── SessionStore (Singleton / Observable) ────────────────────────────────────
//
// Fuente de verdad única para la sesión en el cliente.
//
// DISEÑO:
//   1. Bootstrap síncrono desde localStorage (hydration instantánea).
//   2. Una sola llamada a supabase.auth.getSession() al inicio para validar.
//   3. onAuthStateChange como única fuente de actualizaciones posteriores.
//   4. getAccessToken() es SÍNCRONO: nunca adquiere un lock.
//   5. Cross-tab via BroadcastChannel.
//
// Esto elimina la raíz del lockout: ningún componente ni hook llama nunca
// a getSession() durante el flujo normal; solo leen del estado en memoria.
// ─────────────────────────────────────────────────────────────────────────────

class _SessionStore {
  private _snapshot: SessionSnapshot = {
    session: null,
    status: "unknown",
    updatedAt: 0,
  };

  private readonly _listeners = new Set<Listener>();
  private _channel: BroadcastChannel | null = null;
  private _bootstrapped = false;

  // ─── Bootstrap (llamar una vez desde el root client component) ────────────

  /**
   * Inicializa el store. Llama esto desde el layout/provider de más alto nivel.
   * Seguro para llamar múltiples veces (idempotente).
   */
  bootstrap(): void {
    if (this._bootstrapped) return;
    this._bootstrapped = true;

    // ① Hydrate sincrónico desde localStorage para que la UI no parpadee.
    this._hydrateFromStorage();

    // ② Suscribir a onAuthStateChange ANTES de llamar getSession(),
    //   para que no haya race entre el evento INITIAL_SESSION y nuestra llamada.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      this._apply(session);
      // Notificar a otras tabs
      this._channel?.postMessage({ type: "session_update", session });
    });

    // Guardar unsubscribe para limpieza (no crítico en producción, útil en tests)
    (this as unknown as { _unsubscribe: () => void })._unsubscribe = () =>
      subscription.unsubscribe();

    // ③ Cross-tab sync
    if (typeof BroadcastChannel !== "undefined") {
      this._channel = new BroadcastChannel("auth-session-v2");
      this._channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === "session_update") {
          // Otra tab actualizó la sesión; reflejar aquí sin llamar a Supabase.
          this._apply(e.data.session ?? null, false /* no re-broadcast */);
        } else if (e.data?.type === "session_signed_out") {
          this._apply(null, false);
        }
      };
    }

    // ④ Llamada única de validación. INITIAL_SESSION ya actualizará el store vía
    //   onAuthStateChange, pero hacemos getSession() para asegurar que el token
    //   persiste en el in-memory state de supabase-js antes que cualquier fetch.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        // Solo actualizar si onAuthStateChange aún no lo hizo (status === 'unknown').
        if (this._snapshot.status === "unknown") {
          this._apply(session);
        }
      })
      .catch(() => {
        // Error de red en bootstrap: dejar status 'unknown' — refreshScheduler reintentará.
        if (this._snapshot.status === "unknown") {
          this._apply(null);
        }
      });
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /** Retorna la snapshot actual del store. Siempre síncrono. */
  getSnapshot(): Readonly<SessionSnapshot> {
    return this._snapshot;
  }

  /**
   * Retorna el access token actual de forma SÍNCRONA.
   * Retorna null si no hay sesión activa o si el bootstrap no ha terminado.
   * Nunca lanza — los callers deben manejar null como "sin sesión".
   */
  getAccessToken(): string | null {
    return this._snapshot.session?.access_token ?? null;
  }

  /**
   * Retorna el objeto Session actual (puede ser null).
   */
  getSession(): Session | null {
    return this._snapshot.session;
  }

  /**
   * Suscribirse a cambios de snapshot. Retorna función de unsubscribe.
   *
   * La notificación inicial se difiere a un microtask (queueMicrotask) para
   * evitar el Temporal Dead Zone: si el caller hace
   *   `const unsub = SessionStore.subscribe((s) => { unsub(); })`
   * el callback se ejecuta DESPUÉS de que `unsub` está asignado.
   * Para leer el estado actual de forma síncrona, usar getSnapshot().
   */
  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    // Notificación diferida: evita TDZ cuando el callback referencia el retorno
    // de esta misma llamada (patrón `const unsub = subscribe(() => unsub())`)
    queueMicrotask(() => {
      if (this._listeners.has(listener)) {
        listener(this._snapshot);
      }
    });
    return () => this._listeners.delete(listener);
  }

  /**
   * Actualizar la sesión desde el refreshScheduler cuando el token se renueva.
   * También invalida el caché cross-tab.
   */
  applySession(session: Session | null): void {
    this._apply(session);
    this._channel?.postMessage({ type: "session_update", session });
  }

  /**
   * Marcar como signed-out y notificar a otras tabs.
   */
  applySignOut(): void {
    this._apply(null);
    this._channel?.postMessage({ type: "session_signed_out" });
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  /**
   * Hydrate síncrono desde localStorage usando la clave que almacena supabase-js.
   * El formato de la clave es: sb-<project-ref>-auth-token
   */
  private _hydrateFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const projectRef =
        process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
          /https:\/\/([^.]+)\.supabase\.co/,
        )?.[1] ?? "";
      if (!projectRef) return;

      const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        access_token?: string;
        expires_at?: number;
        user?: Session["user"];
        refresh_token?: string;
      };

      if (
        parsed?.access_token &&
        parsed?.expires_at &&
        parsed.expires_at * 1000 > Date.now()
      ) {
        // Token no expirado en cliente — usarlo como hydration inicial.
        // onAuthStateChange lo validará en Supabase inmediatamente después.
        this._snapshot = {
          session: parsed as unknown as Session,
          status: "authenticated",
          updatedAt: Date.now(),
        };
      }
    } catch {
      // localStorage no disponible o JSON corrupto — ignorar, el bootstrap async se encarga.
    }
  }

  private _apply(session: Session | null, broadcast = true): void {
    const status: SessionStatus = session ? "authenticated" : "anonymous";

    const next: SessionSnapshot = {
      session,
      status,
      updatedAt: Date.now(),
    };

    this._snapshot = next;
    this._notify(next);

    if (broadcast && !session) {
      // Notificar a otras tabs que hubo signout
      this._channel?.postMessage({ type: "session_signed_out" });
    }
  }

  private _notify(snapshot: SessionSnapshot): void {
    this._listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch {
        // Nunca dejar que un listener rompa el store
      }
    });
  }
}

// Singleton exportado
export const SessionStore = new _SessionStore();
