import { supabase } from "./supabase";
import { SessionStore } from "./auth/SessionStore";

/**
 * Error tipado para el estado transitorio donde la sesion aun no esta
 * disponible (bootstrap no termino). Usar `instanceof` en lugar de
 * `message.includes(...)` para que el idioma del mensaje no afecte la logica.
 */
export class SessionUnavailableError extends Error {
  constructor(
    message = "Sesion no disponible — el token puede estar renovandose",
  ) {
    super(message);
    this.name = "SessionUnavailableError";
  }
}

// ─── Señal de logout voluntario ──────────────────────────────────────────────
//
// Se activa cuando el usuario cierra sesión deliberadamente para que
// SessionChecker no interprete el SIGNED_OUT como una pérdida de sesión
// inesperada y evitar así la redirección con el banner de "sesión expirada".

let _voluntarySignOut = false;

/** Señaliza que el logout fue voluntario. Llamar antes de supabase.auth.signOut(). */
export function markVoluntarySignOut(): void {
  _voluntarySignOut = true;
}

/** Retorna true si el logout fue iniciado voluntariamente por el usuario. */
export function isVoluntarySignOut(): boolean {
  return _voluntarySignOut;
}

// ─── Actividad ────────────────────────────────────────────────────────────────

let lastActivityTimestamp = Date.now();

export function markActivity() {
  lastActivityTimestamp = Date.now();
}

export function getTimeSinceLastActivity(): number {
  return Date.now() - lastActivityTimestamp;
}

// ─── API publica de sesion ────────────────────────────────────────────────────
//
// Fachadas delgadas sobre SessionStore.
//
// ANTES: cada caller llamaba a supabase.auth.getSession() con coalescing +
//   locks + timeouts + reintentos → cascada de "Session lock timeout" tras
//   inactividad.
//
// AHORA: SessionStore mantiene la sesion en memoria. getAccessToken() es
//   sincrono. Ningun caller adquiere un lock durante el flujo normal.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legado — en la nueva arquitectura el store se actualiza via onAuthStateChange
 * para todos los casos (login, logout, refresh). Esta funcion es un no-op intencional.
 * Mantenida por compatibilidad con callers existentes en authService.ts.
 */
export function invalidateSessionCache() {
  // no-op: SessionStore se actualiza via onAuthStateChange automaticamente.
  // Llamar applySignOut() aqui revierte actualizaciones validas (login, refresh).
}

/**
 * Retorna la sesion actual desde el SessionStore (sin adquirir ningun lock).
 * API mantenida para compatibilidad con AuthContext / authService.
 */
export async function getSessionViaManager() {
  const snapshot = SessionStore.getSnapshot();

  // Si el store aun esta en estado 'unknown' (bootstrap no termino),
  // esperamos que onAuthStateChange dispare el INITIAL_SESSION en supabase-js.
  // Damos un maximo de 8 s antes de reportar "sin sesion".
  if (snapshot.status === "unknown") {
    await new Promise<void>((resolve) => {
      // Usar un objeto para que clearTimeout sea siempre accesible desde el
      // callback aunque se ejecute antes de la asignación (queueMicrotask se
      // ejecuta después de setTimeout, pero el objeto ya está inicializado).
      const ctrl: { timerId: ReturnType<typeof setTimeout> | undefined } = {
        timerId: undefined,
      };
      const unsub = SessionStore.subscribe((s) => {
        if (s.status !== "unknown") {
          clearTimeout(ctrl.timerId); // Evitar que el fallback de 8s quede huérfano
          unsub();
          resolve();
        }
      });
      ctrl.timerId = setTimeout(() => {
        unsub();
        resolve();
      }, 8_000);
    });
  }

  const session = SessionStore.getSession();
  return {
    data: { session },
    error: null as Error | null,
  };
}

/**
 * Retorna el usuario actual derivado del SessionStore.
 * Nunca adquiere un lock.
 */
export async function getCurrentUserViaManager() {
  const { data } = await getSessionViaManager();
  return { data: { user: data.session?.user ?? null }, error: null };
}

/**
 * Refresca el token una vez. onAuthStateChange actualizara el store via TOKEN_REFRESHED.
 */
export async function refreshSessionViaManager() {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) {
      SessionStore.applySession(data.session);
    }
    return {
      data: { session: data.session ?? null, user: data.user ?? null },
      error: error ?? null,
    };
  } catch (err) {
    return {
      data: { session: null, user: null },
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Pre-calienta el store esperando que el bootstrap termine.
 * Retorna true si hay sesion valida.
 */
export async function warmSession(_signal?: AbortSignal): Promise<boolean> {
  const { data } = await getSessionViaManager();
  return !!data.session;
}

// ─── authenticatedFetch ───────────────────────────────────────────────────────

/**
 * Fetch autenticado con el JWT del usuario.
 *
 * Lee el access token SINCRONAMENTE desde SessionStore.
 * No adquiere ningun lock. Si el token no esta disponible (bootstrap no
 * termino), lanza SessionUnavailableError para que el caller reintente.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  markActivity();

  const signal = options.signal as AbortSignal | undefined;

  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  // Intento 1: token sincrono del store
  let token = SessionStore.getAccessToken();

  // Intento 2: si el store esta en 'unknown', esperar bootstrap una vez
  if (!token && SessionStore.getSnapshot().status === "unknown") {
    await getSessionViaManager(); // Espera hasta 8s al INITIAL_SESSION
    token = SessionStore.getAccessToken();
  }

  if (!token) {
    throw new SessionUnavailableError();
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    console.warn("Recibido 401 No autorizado — la sesion puede haber expirado");
    throw new Error("No autorizado — el token puede haber expirado");
  }

  return response;
}
