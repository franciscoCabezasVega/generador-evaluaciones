import { supabase } from './supabase';

// === Sistema de caché de sesión para reducir llamadas concurrentes ===

// Caché en memoria de la última sesión obtenida
let sessionCache: {
  session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];
  timestamp: number;
} | null = null;

// TTL del caché: 2 minutos (reduce llamadas a getSession y contención de navigator.locks
// en escenarios con múltiples pestañas abiertas simultáneamente)
const SESSION_CACHE_TTL = 120000;

// Tracker de última actividad para coordinar validaciones
let lastActivityTimestamp = Date.now();

// Deduplicate concurrent getSession calls — share a single in-flight promise
let inflightGetSession: ReturnType<typeof supabase.auth.getSession> | null = null;

// Canal BroadcastChannel para sincronizar invalidación de caché de sesión
// entre pestañas. Evita que cada pestaña haga su propia llamada a getSession()
// desencadenando contención en navigator.locks.
const sessionChannel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('session_cache_sync')
    : null;

if (sessionChannel) {
  sessionChannel.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'session_invalidated') {
      sessionCache = null;
      inflightGetSession = null;
    }
  };
}

function deduplicatedGetSession() {
  // Verificar si tenemos un caché válido
  const now = Date.now();
  if (sessionCache && (now - sessionCache.timestamp) < SESSION_CACHE_TTL) {
    // Retornar sesión cacheada sin llamar a Supabase
    return Promise.resolve({
      data: { session: sessionCache.session },
      error: null,
    });
  }

  // Si hay una llamada en progreso, reutilizarla
  if (inflightGetSession) return inflightGetSession;
  
  // Crear nueva llamada y cachearla al completar
  inflightGetSession = supabase.auth.getSession()
    .then((result) => {
      // Actualizar caché si la llamada fue exitosa
      if (!result.error && result.data.session) {
        sessionCache = {
          session: result.data.session,
          timestamp: Date.now(),
        };
      }
      return result;
    })
    .finally(() => {
      inflightGetSession = null;
    });
  
  return inflightGetSession;
}

/**
 * Invalidar el caché de sesión (llamar después de login/logout/refresh exitoso)
 * Notifica a otras pestañas vía BroadcastChannel para que también invaliden su caché,
 * reduciendo la contención de navigator.locks al volver a la pestaña activa.
 */
export function invalidateSessionCache() {
  sessionCache = null;
  inflightGetSession = null;
  sessionChannel?.postMessage({ type: 'session_invalidated' });
}

/**
 * Actualizar timestamp de última actividad - usado para coordinar validaciones
 * y evitar competencia con SessionChecker
 */
export function markActivity() {
  lastActivityTimestamp = Date.now();
}

/**
 * Obtener tiempo desde última actividad (en ms)
 */
export function getTimeSinceLastActivity(): number {
  return Date.now() - lastActivityTimestamp;
}

/**
 * Hacer un fetch autenticado con el token JWT del usuario
 * El timeout es manejado por el caller (useSafeAuthFetch usa AbortController con 10s).
 * Si se pasa un signal en options, se usa directamente para cancelar la request.
 * 
 * @param url - URL del endpoint
 * @param options - Opciones de fetch (incluye signal para timeout/abort)
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  // Marcar actividad para coordinar con SessionChecker
  markActivity();
  
  try {
    // Fail-fast si el signal ya fue abortado (e.g. timeout venció mientras
    // otra operación mantenía bloqueado el navigator.lock de Supabase)
    if (options.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // Obtener el token de sesión sin refrescar.
    // Envolver en Promise.race con 2s de timeout propio para evitar hangs
    // por el navigator.lock interno de @supabase/gotrue-js cuando el
    // auto-refresh o SessionChecker mantienen el lock ocupado (ej. al
    // volver de otra pestaña del navegador).
    let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

    // Lanzar getSession y guardar referencia para catch de fuga
    const getSessionPromise = deduplicatedGetSession();

    try {
      const result = await Promise.race([
        getSessionPromise,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error('getSession timeout')),
            2000, // Reducido de 5s a 2s para reintentar más rápido
          );
          // Si el caller aborta antes, rechazar inmediatamente
          if (options.signal) {
            const onAbort = () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            };
            if (options.signal.aborted) {
              clearTimeout(timer);
              onAbort();
            } else {
              options.signal.addEventListener('abort', onAbort, { once: true });
            }
          }
        }),
      ]);

      if (result.error) {
        throw new Error(`Session error: ${result.error.message}`);
      }
      session = result.data.session;
    } catch (err) {
      // Capturar silenciosamente la promesa fugada de Supabase para evitar
      // unhandled promise rejection si se resuelve/rechaza después del timeout.
      getSessionPromise.catch(() => { /* swallow */ });

      // Re-lanzar AbortError tal cual
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Marcar explícitamente los timeouts de getSession como transitorios
      // para que useSafeAuthFetch los reintente en lugar de tratarlos como
      // sesión expirada.
      if (err instanceof Error && err.message === 'getSession timeout') {
        const te = new Error('getSession timeout — navigator.lock busy');
        te.name = 'SessionLockError';
        throw te;
      }
      // Convertir otros errores de sesión
      throw new Error(
        err instanceof Error ? err.message : 'Error retrieving session',
      );
    }

    if (!session) {
      // Puede ser un estado transitorio si el auto-refresh aún no terminó.
      // Lanzar un error específico que NO sea tratado como "sesión expirada".
      throw new Error('Session not available — token may be refreshing');
    }

    const token = session.access_token;

    // Agregar Authorization header
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    // Hacer el fetch directamente (timeout manejado por el caller via signal)
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Si la respuesta es 401 Unauthorized, la sesión puede estar expirada
    if (response.status === 401) {
      console.warn('Got 401 Unauthorized, session may be expired');
      // NO limpiar aquí - dejar que useSafeAuthFetch maneje la lógica
      throw new Error('Unauthorized - token may be expired');
    }

    return response;
  } catch (error) {
    // No loguear AbortError (es esperado por timeout/desmontaje)
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error('Error in authenticatedFetch:', error);
    throw error;
  }
}
