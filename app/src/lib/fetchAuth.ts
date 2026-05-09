import { supabase } from './supabase';

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

// ─── SessionManager (Singleton) ──────────────────────────────────────────────
//
// Patrón: Singleton + Promise Coalescing
//
// Problema que resuelve:
//   supabase.auth.getSession() adquiere navigator.lock internamente. Si varios
//   componentes la llaman en paralelo (p.ej. al montar una página), cada llamada
//   compite por el lock → solo una avanza, el resto espera → timeouts → errores.
//
// Solución:
//   Una única instancia de SessionManager garantiza que solo hay UNA llamada a
//   supabase.auth.getSession() en vuelo al mismo tiempo. Todos los callers
//   comparten esa misma promesa. Cuando resuelve, el caché sirve a los siguientes.
//   El caller puede abortar su *espera* via AbortSignal sin cancelar la promesa
//   compartida ni afectar a otros callers.
//
// Con esto desaparecen: SessionLockError, warmSession complejo, timeout race.
// ─────────────────────────────────────────────────────────────────────────────

class SessionManager {
  private static _instance: SessionManager | null = null;

  // Caché en memoria con TTL de 5 min (alineado con TTL del JWT de Supabase)
  private _cache: { session: GetSessionResult['data']['session']; at: number } | null = null;
  private readonly _TTL = 300_000;

  // La única promesa en vuelo hacia supabase.auth.getSession()
  private _inflight: Promise<GetSessionResult> | null = null;

  // Sincronización cross-tab: invalida el caché cuando otra pestaña hace logout/refresh
  private _channel: BroadcastChannel | null = null;

  private constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this._channel = new BroadcastChannel('session_cache_sync');
      this._channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === 'session_invalidated') {
          this._cache = null;
          this._inflight = null;
        }
      };
    }
  }

  static getInstance(): SessionManager {
    if (!SessionManager._instance) {
      SessionManager._instance = new SessionManager();
    }
    return SessionManager._instance;
  }

  /** Invalida caché local y notifica a otras pestañas. */
  invalidate(broadcast = true) {
    this._cache = null;
    this._inflight = null;
    if (broadcast) {
      this._channel?.postMessage({ type: 'session_invalidated' });
    }
  }

  /**
   * Retorna la sesión actual con tres niveles de optimización:
   *
   * 1. Caché fresco   → retorno inmediato sin ninguna llamada a Supabase.
   * 2. Llamada en vuelo → se comparte la promesa existente (zero lock adicional).
   * 3. Sin caché      → inicia UNA llamada a Supabase; callers posteriores comparten.
   *
   * Si se pasa un AbortSignal, cancela solo la *espera de este caller*,
   * sin afectar la promesa compartida ni a otros callers.
   */
  getSession(signal?: AbortSignal): Promise<GetSessionResult> {
    // Nivel 1: caché fresco
    if (this._cache && Date.now() - this._cache.at < this._TTL) {
      return Promise.resolve({ data: { session: this._cache.session }, error: null } as GetSessionResult);
    }

    // Nivel 2 + 3: una sola llamada en vuelo
    if (!this._inflight) {
      this._inflight = supabase.auth
        .getSession()
        .then((result) => {
          if (!result.error && result.data.session) {
            this._cache = { session: result.data.session, at: Date.now() };
          }
          return result;
        })
        .finally(() => {
          this._inflight = null;
        });
    }

    // Permitir al caller abortar su espera sin afectar a los demás
    if (signal) {
      if (signal.aborted) {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return Promise.race([
        this._inflight,
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true },
          );
        }),
      ]);
    }

    return this._inflight;
  }
}

// ─── Actividad ────────────────────────────────────────────────────────────────

let lastActivityTimestamp = Date.now();

export function markActivity() {
  lastActivityTimestamp = Date.now();
}

export function getTimeSinceLastActivity(): number {
  return Date.now() - lastActivityTimestamp;
}

// ─── API pública de sesión ────────────────────────────────────────────────────

/**
 * Invalida el caché de sesión (llamar tras login/logout/refresh exitoso).
 * Notifica a otras pestañas via BroadcastChannel.
 */
export function invalidateSessionCache() {
  SessionManager.getInstance().invalidate();
}

/**
 * Pre-calienta el caché iniciando la obtención de sesión si aún no está en vuelo.
 * Útil para "adelantar" la llamada antes de lanzar varios fetches en paralelo.
 * Retorna true si hay sesión válida, false en cualquier otro caso.
 */
export async function warmSession(signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await SessionManager.getInstance().getSession(signal);
    return !result.error && !!result.data.session;
  } catch {
    return false;
  }
}

// ─── authenticatedFetch ───────────────────────────────────────────────────────

/**
 * Fetch autenticado con el JWT del usuario.
 *
 * La obtención de sesión está completamente serializada por SessionManager:
 * - Caché fresco    → retorno instantáneo.
 * - Lock ocupado    → espera la única promesa compartida (no compite por el lock).
 * - Timeout externo → el AbortSignal del caller (useSafeAuthFetch usa 15 s)
 *                     cancela la espera sin afectar a otros callers.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}) {
  markActivity();

  const signal = options.signal as AbortSignal | undefined;

  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const result = await SessionManager.getInstance().getSession(signal);

  if (result.error) {
    throw new Error(`Session error: ${result.error.message}`);
  }

  if (!result.data.session) {
    // Estado transitorio: el auto-refresh aún no terminó. El caller reintentará.
    throw new Error('Session not available — token may be refreshing');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${result.data.session.access_token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    console.warn('Got 401 Unauthorized, session may be expired');
    throw new Error('Unauthorized - token may be expired');
  }

  return response;
}

