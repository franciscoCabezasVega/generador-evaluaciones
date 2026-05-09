"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authenticatedFetch, warmSession } from "@/lib/fetchAuth";
import {
  CatalogProduct,
  CatalogCategory,
  CatalogComplexity,
  CatalogSquad,
  CatalogQAMember,
} from "@/lib/types";

export interface CatalogData {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  complexities: CatalogComplexity[];
  squads: CatalogSquad[];
  qaMembers: CatalogQAMember[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Caché compartida entre instancias del hook (catálogos cambian raramente)
let cachedData: Omit<CatalogData, "loading" | "error" | "reload"> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function useCatalogData(): CatalogData {
  const [products, setProducts] = useState<CatalogProduct[]>(
    cachedData?.products ?? [],
  );
  const [categories, setCategories] = useState<CatalogCategory[]>(
    cachedData?.categories ?? [],
  );
  const [complexities, setComplexities] = useState<CatalogComplexity[]>(
    cachedData?.complexities ?? [],
  );
  const [squads, setSquads] = useState<CatalogSquad[]>(
    cachedData?.squads ?? [],
  );
  const [qaMembers, setQaMembers] = useState<CatalogQAMember[]>(
    cachedData?.qaMembers ?? [],
  );
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reloadCountRef = useRef(0);

  const fetchAll = useCallback(async () => {
    // Si el caché es reciente, no refetch
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
      setProducts(cachedData.products);
      setCategories(cachedData.categories);
      setComplexities(cachedData.complexities);
      setSquads(cachedData.squads);
      setQaMembers(cachedData.qaMembers);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      // Pre-calentar la sesión UNA SOLA VEZ antes del Promise.all.
      // Evita que las 5 llamadas paralelas compitan por navigator.lock individualmente:
      // una vez que warmSession() resuelve, el token queda en caché y todas usan el caché.
      const sessionOk = await warmSession(controller.signal);
      if (!sessionOk || controller.signal.aborted) return;

      const [productsRes, categoriesRes, complexitiesRes, squadsRes, qaRes] =
        await Promise.all([
          authenticatedFetch("/api/settings/products", {
            signal: controller.signal,
          }),
          authenticatedFetch("/api/settings/categories", {
            signal: controller.signal,
          }),
          authenticatedFetch("/api/settings/complexities", {
            signal: controller.signal,
          }),
          authenticatedFetch("/api/settings/squads", {
            signal: controller.signal,
          }),
          authenticatedFetch("/api/settings/qa-members", {
            signal: controller.signal,
          }),
        ]);

      if (controller.signal.aborted) return;

      const [p, c, cx, s, q] = await Promise.all([
        productsRes.json(),
        categoriesRes.json(),
        complexitiesRes.json(),
        squadsRes.json(),
        qaRes.json(),
      ]);

      if (controller.signal.aborted) return;

      // Guardar en caché compartida
      cachedData = {
        products: p as CatalogProduct[],
        categories: c as CatalogCategory[],
        complexities: cx as CatalogComplexity[],
        squads: s as CatalogSquad[],
        qaMembers: q as CatalogQAMember[],
      };
      cacheTimestamp = Date.now();

      setProducts(cachedData.products);
      setCategories(cachedData.categories);
      setComplexities(cachedData.complexities);
      setSquads(cachedData.squads);
      setQaMembers(cachedData.qaMembers);
    } catch (err) {
      if (controller.signal.aborted) return;
      // SessionLockError residual (warmSession agotó sus propios reintentos) —
      // ya no reintentamos aquí para no crear loops; simplemente no mostramos error
      // porque warmSession ya loggeó el problema.
      if (err instanceof Error && err.name === "SessionLockError") return;
      // "Session not available": sesión limpiada por logout — ignorar silenciosamente
      if (err instanceof Error && err.message.includes("Session not available"))
        return;
      console.error("Error loading catalog data:", err);
      setError("Error al cargar los catálogos. Intenta recargar la página.");
    } finally {
      // Solo apagar loading si no se abortó (evita parpadeo durante reintentos)
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const reload = useCallback(() => {
    // Invalidar caché y refetch
    cachedData = null;
    cacheTimestamp = 0;
    reloadCountRef.current += 1;
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchAll]);

  return {
    products,
    categories,
    complexities,
    squads,
    qaMembers,
    loading,
    error,
    reload,
  };
}

/**
 * Invalida el caché de catálogos globalmente.
 * Llamar después de crear/editar/eliminar registros en /settings.
 */
export function invalidateCatalogCache() {
  cachedData = null;
  cacheTimestamp = 0;
}
