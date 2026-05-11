"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authenticatedFetch, warmSession } from "@/lib/fetchAuth";
import {
  CatalogProduct,
  CatalogProjectType,
  CatalogComplexity,
  CatalogSquad,
  CatalogQAMember,
  CatalogTimingCategory,
} from "@/lib/types";

export interface CatalogData {
  products: CatalogProduct[];
  projectTypes: CatalogProjectType[];
  complexities: CatalogComplexity[];
  squads: CatalogSquad[];
  qaMembers: CatalogQAMember[];
  timingCategories: CatalogTimingCategory[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Caché compartida entre instancias del hook (catálogos cambian raramente)
let cachedData: Omit<CatalogData, "loading" | "error" | "reload"> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Invalidar caché si tiene shape antigua (e.g. tras HMR en desarrollo)
if (
  cachedData &&
  (!Array.isArray(
    (cachedData as unknown as Record<string, unknown>).projectTypes,
  ) ||
    !Array.isArray(
      (cachedData as unknown as Record<string, unknown>).timingCategories,
    ))
) {
  cachedData = null;
  cacheTimestamp = 0;
}

export function useCatalogData(): CatalogData {
  const [products, setProducts] = useState<CatalogProduct[]>(
    cachedData?.products ?? [],
  );
  const [projectTypes, setProjectTypes] = useState<CatalogProjectType[]>(
    cachedData?.projectTypes ?? [],
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
  const [timingCategories, setTimingCategories] = useState<
    CatalogTimingCategory[]
  >(cachedData?.timingCategories ?? []);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reloadCountRef = useRef(0);

  const fetchAll = useCallback(async () => {
    // Si el caché es reciente, no refetch
    if (cachedData && Date.now() - cacheTimestamp < CACHE_TTL) {
      setProducts(
        Array.isArray(cachedData.products) ? cachedData.products : [],
      );
      setProjectTypes(
        Array.isArray(cachedData.projectTypes) ? cachedData.projectTypes : [],
      );
      setComplexities(
        Array.isArray(cachedData.complexities) ? cachedData.complexities : [],
      );
      setSquads(Array.isArray(cachedData.squads) ? cachedData.squads : []);
      setQaMembers(
        Array.isArray(cachedData.qaMembers) ? cachedData.qaMembers : [],
      );
      setTimingCategories(
        Array.isArray(cachedData.timingCategories)
          ? cachedData.timingCategories
          : [],
      );
      setError(null);
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

      const [
        productsRes,
        projectTypesRes,
        complexitiesRes,
        squadsRes,
        qaRes,
        timingCatRes,
      ] = await Promise.all([
        authenticatedFetch("/api/settings/products", {
          signal: controller.signal,
        }),
        authenticatedFetch("/api/settings/project-types", {
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
        authenticatedFetch(
          "/api/settings/timing-categories?includeInactive=true",
          {
            signal: controller.signal,
          },
        ),
      ]);

      if (controller.signal.aborted) return;

      // Verificar que todas las respuestas sean exitosas antes de parsear
      const allOk = [
        productsRes,
        projectTypesRes,
        complexitiesRes,
        squadsRes,
        qaRes,
        timingCatRes,
      ].every((r) => r.ok);
      if (!allOk) {
        setError("Error al cargar los catálogos. Intenta recargar la página.");
        setLoading(false);
        return;
      }

      const [p, c, cx, s, q, tc] = await Promise.all([
        productsRes.json(),
        projectTypesRes.json(),
        complexitiesRes.json(),
        squadsRes.json(),
        qaRes.json(),
        timingCatRes.json(),
      ]);

      if (controller.signal.aborted) return;

      // Guardar en caché compartida (garantizar arrays para prevenir errores runtime)
      cachedData = {
        products: Array.isArray(p) ? (p as CatalogProduct[]) : [],
        projectTypes: Array.isArray(c) ? (c as CatalogProjectType[]) : [],
        complexities: Array.isArray(cx) ? (cx as CatalogComplexity[]) : [],
        squads: Array.isArray(s) ? (s as CatalogSquad[]) : [],
        qaMembers: Array.isArray(q) ? (q as CatalogQAMember[]) : [],
        timingCategories: Array.isArray(tc)
          ? (tc as CatalogTimingCategory[]).sort(
              (a, b) => a.display_order - b.display_order,
            )
          : [],
      };
      cacheTimestamp = Date.now();

      setProducts(cachedData.products);
      setProjectTypes(cachedData.projectTypes);
      setComplexities(cachedData.complexities);
      setSquads(cachedData.squads);
      setQaMembers(cachedData.qaMembers);
      setTimingCategories(cachedData.timingCategories);
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
    projectTypes,
    complexities,
    squads,
    qaMembers,
    timingCategories,
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
