import { useEffect, useRef, useCallback, useState } from "react";
import { authService } from "@/lib/services/authService";

const LAST_ACTIVITY_KEY = "auth_last_activity";

/**
 * Tiempo de ausencia a partir del cual se fuerza un reload completo del bundle.
 * Coincide con el staleTime del caché (5 min) — toda ausencia que ya superó
 * el caché dispara reload en vez de un refetch sutil.
 */
export const RELOAD_THRESHOLD_MS = 5 * 60 * 1_000; // 5 min

interface UseSessionTimeoutManagerOptions {
  enabled?: boolean; // Solo activo cuando hay usuario autenticado
  inactivityTimeout?: number; // ms hasta que sesión expire por inactividad (default: 30 min)
  warningTime?: number; // ms antes de expiración para mostrar modal (default: 60s)
  /** Retorna true si hay mutaciones en vuelo — evita recargar con datos sin guardar. */
  hasPendingMutations?: () => boolean;
}

interface SessionTimeoutState {
  isWarningVisible: boolean;
  timeRemaining: number;
}

/* ---------- localStorage helpers ---------- */

function getStoredLastActivity(): number | null {
  try {
    const v = localStorage.getItem(LAST_ACTIVITY_KEY);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}

function storeLastActivity(ts: number): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, ts.toString());
  } catch {
    /* localStorage might be unavailable */
  }
}

function clearStoredLastActivity(): void {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Hook centralizado para gestionar timeout de sesión
 *
 * Características:
 * - Persiste última actividad en localStorage (sobrevive reloads y tab discarding)
 * - Rastrea acciones relevantes del usuario (clicks en elementos interactivos, teclado, form submissions)
 * - Detecta inactividad de 30 minutos
 * - Muestra modal de advertencia 60 segundos antes de expirar
 * - Verifica estado al cambiar visibilidad de la pestaña (tab switching)
 * - Limpia sesión al expirar
 *
 * Retorna:
 * - isWarningVisible: si mostrar el modal
 * - timeRemaining: segundos hasta expiración
 * - handleContinue: llamar cuando usuario quiere continuar
 * - handleExpire: forzar expiración inmediata
 */
export function useSessionTimeoutManager(
  options: UseSessionTimeoutManagerOptions = {},
) {
  const {
    enabled = true,
    inactivityTimeout = 30 * 60 * 1000, // 30 minutos
    warningTime = 60 * 1000, // 60 segundos
    hasPendingMutations,
  } = options;

  const [state, setState] = useState<SessionTimeoutState>({
    isWarningVisible: false,
    timeRemaining: 0,
  });

  // --- Timer refs ---
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const expiryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- State refs ---
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);
  const isExpiringRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  // Ref para leer siempre la última versión del guard sin añadirlo a los deps del effect
  const hasPendingMutationsRef = useRef(hasPendingMutations);
  hasPendingMutationsRef.current = hasPendingMutations;

  /* ========== Timer management ========== */

  const clearAllTimers = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (expiryTimeoutRef.current) {
      clearTimeout(expiryTimeoutRef.current);
      expiryTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  /* ========== Session expiration ========== */

  const handleSessionExpiration = useCallback(async () => {
    if (!isMountedRef.current) return;
    // Guard: evitar doble llamada
    if (isExpiringRef.current) return;
    isExpiringRef.current = true;

    setState({ isWarningVisible: false, timeRemaining: 0 });
    clearAllTimers();
    clearStoredLastActivity();

    console.warn("Session expired due to inactivity");
    await authService.clearSession("inactive");
  }, [clearAllTimers]);

  /* ========== Warning phase ========== */

  const startWarning = useCallback(
    (remainingMs: number) => {
      if (!isMountedRef.current || isExpiringRef.current) return;

      warningShownRef.current = true;
      const seconds = Math.max(1, Math.ceil(remainingMs / 1000));

      setState({ isWarningVisible: true, timeRemaining: seconds });

      // Timer de expiración final
      expiryTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        await handleSessionExpiration();
      }, remainingMs);
    },
    [handleSessionExpiration],
  );

  /* ========== Schedule timers based on last activity ========== */

  const scheduleTimers = useCallback(
    (lastActivity: number) => {
      if (!isMountedRef.current) return;

      clearAllTimers();
      warningShownRef.current = false;
      isExpiringRef.current = false;

      const elapsed = Date.now() - lastActivity;
      const remaining = inactivityTimeout - elapsed;

      if (remaining <= 0) {
        // Ya expiró (ej: tab fue descartada y reabierta)
        handleSessionExpiration();
        return;
      }

      const timeUntilWarning = remaining - warningTime;

      if (timeUntilWarning <= 0) {
        // Ya está en zona de advertencia
        startWarning(remaining);
      } else {
        // Programar advertencia
        warningTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          startWarning(warningTime);
        }, timeUntilWarning);
      }
    },
    [
      inactivityTimeout,
      warningTime,
      clearAllTimers,
      handleSessionExpiration,
      startWarning,
    ],
  );

  /* ========== Activity tracking ========== */

  const recordActivity = useCallback(() => {
    if (warningShownRef.current || isExpiringRef.current) return;

    const now = Date.now();
    // Throttle: 2 segundos mínimo entre resets
    if (now - lastActivityRef.current < 2000) return;

    lastActivityRef.current = now;
    storeLastActivity(now);
    setState({ isWarningVisible: false, timeRemaining: 0 });
    scheduleTimers(now);
  }, [scheduleTimers]);

  /* ========== Continue session (desde modal de advertencia) ========== */

  const handleContinue = useCallback(() => {
    if (!isMountedRef.current) return;

    // Resetear estado de advertencia para permitir nueva actividad
    warningShownRef.current = false;
    isExpiringRef.current = false;
    clearAllTimers();

    const now = Date.now();
    lastActivityRef.current = now;
    storeLastActivity(now);

    setState({ isWarningVisible: false, timeRemaining: 0 });
    scheduleTimers(now);
  }, [clearAllTimers, scheduleTimers]);

  /* ========== Cleanup on unmount ========== */

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  /* ========== Main effect: initialize timers & listeners ========== */

  useEffect(() => {
    if (!enabled) {
      clearAllTimers();
      setState({ isWarningVisible: false, timeRemaining: 0 });
      warningShownRef.current = false;
      isExpiringRef.current = false;
      return;
    }

    // Determinar última actividad desde localStorage
    const stored = getStoredLastActivity();
    const initialActivity = stored ?? Date.now();
    lastActivityRef.current = initialActivity;

    // Persistir si no había valor guardado
    if (!stored) {
      storeLastActivity(initialActivity);
    }

    // Programar timers según última actividad
    scheduleTimers(initialActivity);

    /* --- Event listeners --- */

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.closest("button") ||
        target.closest("a[href]") ||
        target.closest('[role="button"]') ||
        target.closest('[role="tab"]') ||
        target.closest('[role="menuitem"]') ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea") ||
        target.closest("form");

      if (isInteractive) {
        recordActivity();
      }
    };

    const handleKeydown = () => {
      recordActivity();
    };

    const handleFormSubmit = () => {
      recordActivity();
    };

    // Cuando la pestaña vuelve a ser visible, verificar si la sesión debería haber expirado
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      const storedTs = getStoredLastActivity();
      const lastAct = storedTs ?? lastActivityRef.current;
      const elapsed = Date.now() - lastAct;

      if (elapsed >= inactivityTimeout) {
        // Ya expiró mientras la pestaña estaba oculta
        handleSessionExpiration();
      } else if (elapsed >= inactivityTimeout - warningTime) {
        // En zona de advertencia
        if (!warningShownRef.current) {
          clearAllTimers();
          startWarning(inactivityTimeout - elapsed);
        }
      } else if (elapsed >= RELOAD_THRESHOLD_MS) {
        // Ausencia prolongada pero sesión activa → reload completo del bundle
        // para evitar JS desactualizado tras deploys y estado divergente.
        // No recargar si hay mutaciones en vuelo para no perder datos.
        if (!hasPendingMutationsRef.current?.()) {
          window.location.reload();
          return;
        }
        // Hay mutaciones pendientes — re-programar normalmente
        if (!warningShownRef.current) {
          scheduleTimers(lastAct);
        }
      } else {
        // Re-programar timers (pueden haberse congelado mientras la pestaña estaba oculta)
        if (!warningShownRef.current) {
          scheduleTimers(lastAct);
        }
      }
    };

    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeydown);
    document.addEventListener("submit", handleFormSubmit);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("submit", handleFormSubmit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearAllTimers();
    };
  }, [
    enabled,
    inactivityTimeout,
    warningTime,
    scheduleTimers,
    recordActivity,
    handleSessionExpiration,
    clearAllTimers,
    startWarning,
  ]);

  /* ========== Countdown interval para el modal de advertencia ========== */

  useEffect(() => {
    if (!state.isWarningVisible) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        timeRemaining: Math.max(0, prev.timeRemaining - 1),
      }));
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [state.isWarningVisible]);

  return {
    isWarningVisible: state.isWarningVisible,
    timeRemaining: state.timeRemaining,
    handleContinue,
    handleExpire: handleSessionExpiration,
  };
}
