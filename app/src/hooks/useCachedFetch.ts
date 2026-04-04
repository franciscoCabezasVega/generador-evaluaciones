'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Caché global en memoria — sobrevive mount/unmount de componentes
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  filterKey: string;
}

const globalCache = new Map<string, CacheEntry<unknown>>();

// Tiempo de vida del caché: 5 minutos
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

// Pequeño jitter aleatorio (0-100ms) para evitar thundering herd
// sin imponer delays artificiales de segundos.
function getJitterDelay(): number {
  return Math.random() * 100;
}

/**
 * Genera una clave estable a partir de un objeto de filtros.
 */
function buildFilterKey(filters: Record<string, unknown>): string {
  const sorted = Object.keys(filters)
    .sort()
    .map((k) => `${k}=${String(filters[k] ?? '')}`)
    .join('&');
  return sorted;
}

// ============================================================================
// Hook: useCachedFetch
// ============================================================================

interface UseCachedFetchOptions<T> {
  /** Clave única del recurso (e.g. 'tasks', 'timings', 'reports') */
  cacheKey: string;
  /** Función que ejecuta el fetch real y devuelve datos */
  fetchFn: (signal: AbortSignal) => Promise<T>;
  /** Objeto de filtros activos — cambio de filtros = nueva petición */
  filters: Record<string, unknown>;
  /** Dependencia booleana que bloquea el fetch (e.g. authLoading) */
  enabled?: boolean;
  /** Tiempo de vida del caché en ms (default: 5 min) */
  staleTime?: number;
  /** Valor inicial/fallback mientras no hay data */
  initialData?: T;
}

interface UseCachedFetchReturn<T> {
  data: T;
  loading: boolean;
  error: string | null;
  isRefreshing: boolean;
  /** Forzar refetch (invalida caché) */
  refresh: () => void;
  /** Actualizar data localmente sin fetch (optimistic update) */
  setData: (updater: T | ((prev: T) => T)) => void;
  /** Invalidar caché y refetch en background */
  invalidate: () => void;
}

export function useCachedFetch<T>({
  cacheKey,
  fetchFn,
  filters,
  enabled = true,
  staleTime = DEFAULT_STALE_TIME,
  initialData,
}: UseCachedFetchOptions<T>): UseCachedFetchReturn<T> {
  const filterKey = buildFilterKey(filters);
  const fullKey = `${cacheKey}:${filterKey}`;

  // Intentar hidratar desde caché
  const cached = globalCache.get(fullKey) as CacheEntry<T> | undefined;
  const hasFreshCache = cached != null && Date.now() - cached.timestamp < staleTime;

  const [data, setDataState] = useState<T>(
    hasFreshCache ? cached!.data : (initialData as T)
  );
  // loading debe ser true siempre que no haya caché fresco, independientemente de initialData
  // Esto evita mostrar "no hay registros" prematuramente mientras se fetchean los datos
  const [loading, setLoading] = useState(!hasFreshCache);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  // Mantenernos sincronizados con el fullKey actual
  const fullKeyRef = useRef(fullKey);
  fullKeyRef.current = fullKey;

  // Keep fetchFn ref stable to avoid re-triggering effects
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const doFetch = useCallback(
    async (isBackground: boolean, signal: AbortSignal) => {
      fetchIdRef.current += 1;
      const myId = fetchIdRef.current;

      if (!isBackground) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        const result = await fetchFnRef.current(signal);

        if (!isMountedRef.current || signal.aborted) return;
        // Solo aplicar si somos el fetch más reciente
        if (fetchIdRef.current !== myId) return;

        setDataState(result);
        // Actualizar caché global
        globalCache.set(fullKeyRef.current, {
          data: result,
          timestamp: Date.now(),
          filterKey: fullKeyRef.current,
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.message?.includes('aborted')) return;
        if (!isMountedRef.current) return;
        if (fetchIdRef.current !== myId) return;
        console.error(`[useCachedFetch:${cacheKey}]`, err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        if (isMountedRef.current && fetchIdRef.current === myId) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [cacheKey],
  );

  // === Efecto principal: fetch al montar o cambiar filtros ===
  useEffect(() => {
    if (!enabled) return;

    const cachedEntry = globalCache.get(fullKey) as CacheEntry<T> | undefined;
    const isFresh = cachedEntry != null && Date.now() - cachedEntry.timestamp < staleTime;

    if (isFresh) {
      // Caché fresco: usar datos del caché, no hacer fetch
      setDataState(cachedEntry!.data);
      setLoading(false);
      return;
    }

    // No hay caché o está expirado: hacer fetch
    const controller = new AbortController();
    abortRef.current = controller;

    // Si ya tenemos data (del caché viejo), hacer fetch en background
    const hasStaleData = cachedEntry != null || data != null;

    // Pequeño jitter para reducir contención en getSession() cuando
    // múltiples hooks montan simultáneamente.
    const delay = getJitterDelay();
    const delayTimer = setTimeout(() => {
      if (!controller.signal.aborted) {
        doFetch(hasStaleData && data !== initialData, controller.signal);
      }
    }, delay);

    return () => {
      clearTimeout(delayTimer);
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, enabled, staleTime, doFetch]);

  // === Refresh manual: invalida el caché y re-solicita ===
  const refresh = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    globalCache.delete(fullKeyRef.current);

    const controller = new AbortController();
    abortRef.current = controller;
    doFetch(true, controller.signal);
  }, [doFetch]);

  // === Invalidate: borra caché + refetch en background ===
  const invalidate = useCallback(() => {
    // Borrar todas las entradas de este cacheKey (cualquier filtro)
    for (const key of globalCache.keys()) {
      if (key.startsWith(`${cacheKey}:`)) {
        globalCache.delete(key);
      }
    }
    if (!isMountedRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;
    doFetch(true, controller.signal);
  }, [cacheKey, doFetch]);

  // === setData: actualización optimista local + caché ===
  const setData = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setDataState((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        // Actualizar caché global también
        globalCache.set(fullKeyRef.current, {
          data: next,
          timestamp: Date.now(),
          filterKey: fullKeyRef.current,
        });
        return next;
      });
    },
    [],
  );

  return { data, loading, error, isRefreshing, refresh, setData, invalidate };
}

// ============================================================================
// Utilidad: invalidar caché externo (para llamar desde handlers de mutación)
// ============================================================================

export function invalidateCache(cacheKey: string) {
  for (const key of globalCache.keys()) {
    if (key.startsWith(`${cacheKey}:`)) {
      globalCache.delete(key);
    }
  }
}
