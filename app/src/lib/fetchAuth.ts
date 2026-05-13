import { supabase } from "./supabase";

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
type RefreshSessionResult = Awaited<ReturnType<typeof supabase.auth.refreshSession>>;

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
  private _cache: {
    session: GetSessionResult["data"]["session"];
    at: number;
  } | null = null;
  private readonly _TTL = 300_000;

  // La única promesa en vuelo hacia supabase.auth.getSession()
  private _inflight: Promise<GetSessionResult> | null = null;

  // La única promesa en vuelo hacia supabase.auth.refreshSession()
  // Coalesce todas las llamadas concurrentes a refresh para que solo una compita
  // por navigator.lock. Sin esto, Múltiples retries de safeFetch disparan Múltiples
  // refreshSession() en paralelo → todos esperan el lock → timeouts en cascada.
  private _refreshInflight: Promise<RefreshSessionResult> | null = null;

  // Sincronización cross-tab: invalida el caché cuando otra pestaña hace logout/refresh
  private _channel: BroadcastChannel | null = null;

  private constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this._channel = new BroadcastChannel("session_cache_sync");
      this._channel.onmessage = (e: MessageEvent) => {
        if (e.data?.type === "session_invalidated") {
          this._cache = null;
          this._inflight = null;
        }
      };
    }

    // Suscribirse a cambios de estado de auth de Supabase.
    //
    // Supabase refresca el token ~60s antes de que expire (auto-refresh).
    // Sin esta suscripción, cuando el usuario vuelve tras inactividad y llama
    // a getSession(), la promesa compite por navigator.lock con el refresh
    // que Supabase ya está haciendo en background → bloqueo.
    //
    // Con esta suscripción: TOKEN_REFRESHED actualiza el caché directamente
    // desde el evento (sin llamar a getSession()). Cuando el usuario hace clic
    // en "Actualizar", el caché ya está fresco → retorno inmediato, sin lock.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        if (session) {
          this._cache = { session, at: Date.now() };
          this._inflight = null;
        }
      } else if (event === "SIGNED_OUT") {
        this._cache = null;
        this._inflight = null;
      }
    });
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
      this._channel?.postMessage({ type: "session_invalidated" });
    }
  }

  /**
   * Refresca el token. Coalesce llamadas concurrentes — solo una refreshSession()
   * en vuelo a la vez. Las demás reciben la misma promesa.
   * Timeout de 10s para evitar bloqueos de navigator.lock.
   */
  refreshSession(): Promise<RefreshSessionResult> {
    if (this._refreshInflight) {
      // Concurrent caller: comparte la promesa subyacente real pero aplica un
      // timeout propio. _refreshInflight apunta a la llamada real (no al race),
      // por lo que un timeout aquí NO la limpia ni inicia un refresh paralelo.
      return Promise.race([
        this._refreshInflight,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new DOMException(
                  "refreshSession timed out waiting for lock",
                  "AbortError",
                ),
              ),
            10_000,
          ),
        ),
      ]);
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new DOMException(
              "refreshSession timed out waiting for lock",
              "AbortError",
            ),
          ),
        10_000,
      );
    });

    // _refreshInflight apunta a la promesa REAL de supabase.auth.refreshSession(),
    // no al resultado del race. Así, si el timeout vence para este caller,
    // _refreshInflight sigue apuntando a la llamada real y los callers
    // concurrentes pueden coalescerse en ella en vez de iniciar un refresh
    // paralelo que re-contendería navigator.lock provocando timeouts en cascada.
    const realRefresh = supabase.auth.refreshSession()
      .then(
        (result) => {
          clearTimeout(timeoutId);
          // Actualizar caché con la nueva sesión (TOKEN_REFRESHED también lo hará,
          // pero hacerlo aquí evita una ventana de race entre callers).
          if (!result.error && result.data.session) {
            this._cache = { session: result.data.session, at: Date.now() };
          }
          return result;
        },
        (err) => {
          clearTimeout(timeoutId);
          throw err;
        },
      )
      .finally(() => {
        this._refreshInflight = null;
      });

    this._refreshInflight = realRefresh;

    // Retorna una vista con timeout para este caller; _refreshInflight permanece.
    return Promise.race([realRefresh, timeoutPromise]);
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
      return Promise.resolve({
        data: { session: this._cache.session },
        error: null,
      } as GetSessionResult);
    }

    // Nivel 2 + 3: una sola llamada en vuelo
    if (!this._inflight) {
      // Timeout de seguridad: si supabase.auth.getSession() se bloquea
      // esperando navigator.lock (auto-refresh de Supabase tras inactividad),
      // la promesa nunca resuelve. Sin este timeout, todos los reintentos de
      // safeFetch comparten la misma _inflight colgada y el spinner dura ~51s.
      // Con 8s, _inflight se cancela, se pone a null, y el siguiente reintento
      // inicia un getSession() fresco (con el lock probablemente ya libre).
      let inflightTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        inflightTimeoutId = setTimeout(
          () =>
            reject(
              new DOMException(
                "getSession timed out waiting for lock",
                "AbortError",
              ),
            ),
          12_000,
        );
      });

      this._inflight = Promise.race([
        supabase.auth.getSession(),
        timeoutPromise,
      ])
        .then(
          (result) => {
            clearTimeout(inflightTimeoutId);
            if (!result.error && result.data.session) {
              this._cache = { session: result.data.session, at: Date.now() };
            }
            return result;
          },
          (err) => {
            clearTimeout(inflightTimeoutId);
            throw err;
          },
        )
        .finally(() => {
          this._inflight = null;
        });
    }

    // Permitir al caller abortar su espera sin afectar a los demás
    if (signal) {
      if (signal.aborted) {
        return Promise.reject(
          new DOMException("The operation was aborted.", "AbortError"),
        );
      }
      return Promise.race([
        this._inflight,
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              ),
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
 * Retorna la sesión actual a través del SessionManager (con caché y coalescing).
 * Usar SIEMPRE en lugar de supabase.auth.getSession() directo para evitar
 * competir por navigator.lock y causar "getSession timed out".
 */
export async function getSessionViaManager() {
  try {
    return await SessionManager.getInstance().getSession();
  } catch (err) {
    // Retorna el error real para que los callers puedan distinguir un fallo
    // transitorio (ej. lock timeout) de un "sin sesión" genuino.
    // Retornar error: null hacía ambos casos indistinguibles.
    return {
      data: { session: null },
      error: (
        err instanceof Error || err instanceof DOMException
          ? err
          : new Error(String(err))
      ) as unknown as NonNullable<GetSessionResult["error"]>,
    };
  }
}

/**
 * Retorna el usuario actual derivado del SessionManager (sin llamar getUser()).
 * Evita adquirir navigator.lock una segunda vez y previene contención.
 */
export async function getCurrentUserViaManager() {
  const { data, error } = await getSessionViaManager();
  return { data: { user: data.session?.user ?? null }, error };
}

/**
 * Refresca el token via SessionManager (coalesce). Usar en lugar de
 * supabase.auth.refreshSession() directo para evitar contención en navigator.lock.
 */
export async function refreshSessionViaManager() {
  try {
    return await SessionManager.getInstance().refreshSession();
  } catch (err) {
    return {
      data: { session: null, user: null },
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
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
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  markActivity();

  const signal = options.signal as AbortSignal | undefined;

  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const result = await SessionManager.getInstance().getSession(signal);

  if (result.error) {
    throw new Error(`Session error: ${result.error.message}`);
  }

  if (!result.data.session) {
    // Estado transitorio: el auto-refresh aún no terminó. El caller reintentará.
    throw new Error("Session not available — token may be refreshing");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${result.data.session.access_token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    console.warn("Got 401 Unauthorized, session may be expired");
    throw new Error("Unauthorized - token may be expired");
  }

  return response;
}
