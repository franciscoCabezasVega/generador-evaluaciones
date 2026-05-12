"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// CacheStore — Singleton que centraliza caché + suscriptores
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheStore {
  private static instance: CacheStore;

  private cache = new Map<string, CacheEntry<unknown>>();
  private subscribers = new Map<string, Set<() => void>>();

  private constructor() {}

  static getInstance(): CacheStore {
    if (!CacheStore.instance) {
      CacheStore.instance = new CacheStore();
    }
    return CacheStore.instance;
  }

  // ── Caché ──────────────────────────────────────────────────────────────────

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  isFresh(key: string, staleTime: number): boolean {
    const entry = this.cache.get(key);
    return entry != null && Date.now() - entry.timestamp < staleTime;
  }

  // ── Suscriptores ───────────────────────────────────────────────────────────

  subscribe(cacheKey: string, cb: () => void): () => void {
    if (!this.subscribers.has(cacheKey)) {
      this.subscribers.set(cacheKey, new Set());
    }
    this.subscribers.get(cacheKey)!.add(cb);
    return () => this.subscribers.get(cacheKey)?.delete(cb);
  }

  notify(cacheKey: string): void {
    this.subscribers.get(cacheKey)?.forEach((cb) => cb());
  }

  // ── Invalidación completa (borra caché + notifica suscriptores) ────────────

  invalidate(cacheKey: string): void {
    this.deleteByPrefix(`${cacheKey}:`);
    this.notify(cacheKey);
  }
}

/** Instancia global compartida por toda la aplicación. */
const cacheStore = CacheStore.getInstance();

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

function getJitterDelay(): number {
  return Math.random() * 100;
}

function buildFilterKey(filters: Record<string, unknown>): string {
  return Object.keys(filters)
    .sort()
    .map((k) => `${k}=${String(filters[k] ?? "")}`)
    .join("&");
}

// ============================================================================
// Hook: useCachedFetch
// ============================================================================

interface UseCachedFetchOptions<T> {
  cacheKey: string;
  fetchFn: (signal: AbortSignal) => Promise<T>;
  filters: Record<string, unknown>;
  enabled?: boolean;
  staleTime?: number;
  initialData?: T;
}

interface UseCachedFetchReturn<T> {
  data: T;
  loading: boolean;
  error: string | null;
  isRefreshing: boolean;
  /** True mientras se ejecuta un auto-retry silencioso tras un fallo transitorio. */
  isReconnecting: boolean;
  refresh: () => void;
  setData: (updater: T | ((prev: T) => T)) => void;
  invalidate: () => void;
}

/**
 * Determina si un error es transitorio y puede beneficiarse de un auto-retry.
 * NO reintenta errores deterministas (4xx) ni AbortErrors.
 */
function isRetryableDataError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof Error) {
    // Errores 4xx son deterministas — no reintentar
    if (/\b4[0-9]{2}\b/.test(err.message)) return false;
  }
  return true;
}

export function useCachedFetch<T>({
  cacheKey,
  fetchFn,
  filters,
  enabled = true,
  staleTime = DEFAULT_STALE_TIME,
  initialData,
}: UseCachedFetchOptions<T>): UseCachedFetchReturn<T> {
  const fullKey = `${cacheKey}:${buildFilterKey(filters)}`;

  const cached = cacheStore.get<T>(fullKey);
  const hasFreshCache =
    cached != null && cacheStore.isFresh(fullKey, staleTime);

  const [data, setDataState] = useState<T>(
    hasFreshCache ? cached!.data : (initialData as T),
  );
  const [loading, setLoading] = useState(!hasFreshCache);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);
  const fullKeyRef = useRef(fullKey);
  fullKeyRef.current = fullKey;
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;
  // Timer del auto-retry silencioso — se cancela si el componente se desmonta
  // o si se dispara un nuevo fetch (filtro cambia, refresh manual, etc.)
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancelar cualquier auto-retry pendiente al desmontar
      if (autoRetryTimerRef.current !== null) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
  }, []);

  const doFetch = useCallback(
    async (isBackground: boolean, signal: AbortSignal, autoRetryAttempt = 0) => {
      // Cancel any pending auto-retry timer — this call starts a new fetch cycle.
      // Covers invalidation (cacheStore.subscribe) and visibilitychange paths
      // that bypass the manual-refresh cancel logic.
      if (autoRetryTimerRef.current !== null) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
        setIsReconnecting(false);
      }

      fetchIdRef.current += 1;
      const myId = fetchIdRef.current;

      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetchFnRef.current(signal);

        if (!isMountedRef.current || signal.aborted) return;
        if (fetchIdRef.current !== myId) return;

        setDataState(result);
        cacheStore.set(fullKeyRef.current, result);
        // Si llegamos aquí desde un auto-retry, limpiar el estado de reconexión
        setIsReconnecting(false);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.message?.includes("aborted")) return;
        if (!isMountedRef.current || fetchIdRef.current !== myId) return;

        const isLockError =
          (err instanceof Error && err.name === "SessionLockError") ||
          (err instanceof Error && err.message.includes("sesión está ocupada"));

        if (isLockError && !isBackground) {
          console.warn(
            `[useCachedFetch:${cacheKey}] SessionLock, reintentando en 3s...`,
          );
          await new Promise((r) => setTimeout(r, 3000));
          if (isMountedRef.current && !signal.aborted) {
            abortRef.current?.abort();
            const retry = new AbortController();
            abortRef.current = retry;
            void doFetch(false, retry.signal);
          }
          return;
        }

        // ── Auto-retry silencioso ──────────────────────────────────────────────
        // Si el error es transitorio (timeout, red, 5xx) y aún no hemos agotado
        // el presupuesto de reintentos, esperar 8s y volver a intentar en background.
        // El usuario ve datos stale (si los hay) con un indicador sutil de "reconectando".
        // Si el auto-retry también falla, entonces sí mostramos el error duro.
        const MAX_AUTO_RETRIES = 1;
        if (isRetryableDataError(err) && autoRetryAttempt < MAX_AUTO_RETRIES) {
          console.warn(
            `[useCachedFetch:${cacheKey}] Error transitorio (intento ${autoRetryAttempt + 1}/${MAX_AUTO_RETRIES + 1}), auto-retry en 8s...`,
            err,
          );
          setIsReconnecting(true);
          autoRetryTimerRef.current = setTimeout(() => {
            autoRetryTimerRef.current = null;
            if (!isMountedRef.current) return;
            const retryController = new AbortController();
            abortRef.current = retryController;
            void doFetch(true, retryController.signal, autoRetryAttempt + 1);
          }, 8_000);
          return;
        }

        // Todos los reintentos agotados — mostrar error al usuario
        setIsReconnecting(false);
        console.error(`[useCachedFetch:${cacheKey}]`, err);
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (isMountedRef.current && fetchIdRef.current === myId) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [cacheKey],
  );

  // Fetch al montar o cambiar filtros/enabled
  useEffect(() => {
    if (!enabled) return;

    // Cancelar cualquier auto-retry pendiente del ciclo anterior
    if (autoRetryTimerRef.current !== null) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
      setIsReconnecting(false);
    }

    if (cacheStore.isFresh(fullKey, staleTime)) {
      const entry = cacheStore.get<T>(fullKey);
      if (entry) setDataState(entry.data);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    // Sólo hay "datos anteriores útiles" si la caché del nuevo key tiene algo.
    // Usar `data` (del estado React) llevaría a mostrar datos de una clave
    // distinta como si fueran relevantes (el bug al cambiar rango de fechas).
    const hasStaleCache = cacheStore.get(fullKey) != null;

    if (!hasStaleCache) {
      // Sin caché para la nueva clave: reset a initialData + activar loading
      // para que la UI no muestre resultados de filtros anteriores.
      setDataState(initialData as T);
      setLoading(true);
    }

    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        doFetch(hasStaleCache, controller.signal);
      }
    }, getJitterDelay());

    return () => {
      clearTimeout(timer);
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, enabled, staleTime, doFetch]);

  // Suscribirse a invalidaciones externas del CacheStore
  useEffect(() => {
    if (!enabled) return;
    return cacheStore.subscribe(cacheKey, () => {
      if (!isMountedRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      doFetch(true, controller.signal);
    });
  }, [cacheKey, enabled, doFetch]);

  // Revalidar al volver a la pestaña si la caché venció mientras estaba en background
  useEffect(() => {
    if (!enabled) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!cacheStore.isFresh(fullKeyRef.current, staleTime)) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        doFetch(true, controller.signal);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, staleTime, doFetch]);

  const refresh = useCallback(() => {
    // Cancelar cualquier auto-retry pendiente antes de iniciar fetch manual
    if (autoRetryTimerRef.current !== null) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    setIsReconnecting(false);
    setError(null);
    abortRef.current?.abort();
    cacheStore.delete(fullKeyRef.current);
    const controller = new AbortController();
    abortRef.current = controller;
    doFetch(true, controller.signal);
  }, [doFetch]);

  const invalidate = useCallback(() => {
    cacheStore.invalidate(cacheKey);
  }, [cacheKey]);

  const setData = useCallback((updater: T | ((prev: T) => T)) => {
    setDataState((prev) => {
      const next =
        typeof updater === "function"
          ? (updater as (p: T) => T)(prev)
          : updater;
      cacheStore.set(fullKeyRef.current, next);
      return next;
    });
  }, []);

  return { data, loading, error, isRefreshing, isReconnecting, refresh, setData, invalidate };
}

// ============================================================================
// API pública para invalidar desde fuera del hook (MutationQueueContext, etc.)
// ============================================================================

/** Invalida el caché de un recurso y notifica a todos los hooks suscritos. */
export function invalidateCache(cacheKey: string): void {
  cacheStore.invalidate(cacheKey);
}
