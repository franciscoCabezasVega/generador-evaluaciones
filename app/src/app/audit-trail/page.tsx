"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { AuditLog, TaskSquad } from "@/lib/types";
import { calculateTaskScore, formatScore } from "@/lib/scoreCalculator";
import { detectSquadChanges } from "@/lib/squadChangeUtils";
import Navbar from "@/components/Navbar";
import CacheWarningBanner from "@/components/CacheWarningBanner";
import { SkeletonAuditTable } from "@/components/Skeleton";
import { RefreshCw } from "lucide-react";

interface AuditLogsResponse {
  data: AuditLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    pages: number;
  };
}

export default function AuditTrailPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { safeFetch } = useSafeAuthFetch();
  const isAdmin = profile?.role === "admin";

  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [filters, setFilters] = useState({
    entityType: "",
    action: "",
    userId: "",
    limit: 50,
    offset: 0,
  });

  // ===== Data fetching con caché en memoria =====
  const {
    data: auditResponse,
    loading,
    error: fetchError,
    isRefreshing,
    refresh: handleRefresh,
  } = useCachedFetch<AuditLogsResponse>({
    cacheKey: "audit-logs",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const params = new URLSearchParams();

        if (filters.entityType)
          params.append("entity_type", filters.entityType);
        if (filters.action) params.append("action", filters.action);
        if (filters.userId) params.append("user_id", filters.userId);
        params.append("limit", String(filters.limit));
        params.append("offset", String(filters.offset));

        const response = await safeFetch(
          `/api/audit-logs?${params.toString()}`,
          { signal },
        );

        if (!response.ok) {
          throw new Error("Failed to load audit logs");
        }

        return await response.json();
      },
      [filters, safeFetch],
    ),
    filters,
    enabled: !authLoading && !!user,
    initialData: {
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, pages: 0 },
    },
  });

  const auditLogs = auditResponse?.data ?? [];
  const pagination = auditResponse?.pagination ?? {
    total: 0,
    limit: 50,
    offset: 0,
    pages: 0,
  };
  const hasError = !!fetchError;

  // Redirigir a login si no hay sesión
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const translateAction = (action: string): string => {
    switch (action) {
      case "CREATE":
        return "Crear";
      case "UPDATE":
        return "Actualizar";
      case "DELETE":
        return "Eliminar";
      default:
        return action;
    }
  };

  const translateEntityType = (entityType: string): string => {
    switch (entityType) {
      case "TASK":
        return "Tarea";
      case "REPORT":
        return "Reporte";
      case "TIMING":
        return "Timing";
      default:
        return entityType;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "badge-success";
      case "UPDATE":
        return "badge-warning";
      case "DELETE":
        return "badge-danger";
      default:
        return "badge-neutral";
    }
  };

  const getEntityBadgeColor = (entityType: string) => {
    switch (entityType) {
      case "TASK":
        return "badge-violet";
      case "REPORT":
        return "badge-info";
      case "TIMING":
        return "badge-warning";
      default:
        return "badge-neutral";
    }
  };

  const getFieldLabel = (fieldName: string): string => {
    const fieldMap: Record<string, string> = {
      // Campos básicos
      name: "Nombre",
      task_link: "Link",
      task_url: "Link",
      url: "Link",
      product_type: "Producto",
      squad: "Squad",
      status: "Estado",
      month: "Mes",
      year: "Año",
      // Devoluciones
      low_returns: "Devoluciones Bajas",
      medium_returns: "Devoluciones Medias",
      high_returns: "Devoluciones Graves",
      // Notas
      additional_notes: "Notas Adicionales",
      // Reportes
      report_date: "Fecha del Reporte",
      squad_name: "Nombre del Squad",
      team_score: "Nota del Equipo",
      // QA y métricas
      project_type: "Tipo Proyecto",
      assigned_qa: "QA Asignados",
      tshirt_size: "Complejidad",
      effort_score_date: "Fecha Esfuerzo",
      task_id: "ID de Tarea",
      // Puntuaciones
      calculated_score: "Nota Calculada",
      score: "Nota",
      // Otros
      id: "ID",
      user_id: "ID Usuario",
      created_at: "Creado",
      updated_at: "Actualizado",
    };
    return fieldMap[fieldName] || fieldName;
  };

  // Función para limpiar y formatear valores de auditoría
  const cleanJsonValue = (value: unknown, key?: string): string => {
    // Arrays (assigned_qa): mostrar como lista separada por comas
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    // Fechas effort_score_date: formatear a DD-MM-YYYY
    if (key === "effort_score_date" && typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, year, month, day] = match;
        return `${day}-${month}-${year}`;
      }
    }
    const json = JSON.stringify(value);
    // Remover comillas al inicio y final si existen
    return json.startsWith('"') && json.endsWith('"')
      ? json.slice(1, -1)
      : json;
  };

  // Orden personalizado para campos de Crear
  const CREATE_FIELD_ORDER = [
    "id",
    "name",
    "year",
    "month",
    "squad",
    "status",
    "user_id",
    "task_link",
    "created_at",
    "updated_at",
    "product_type",
    "additional_notes",
    "low_returns",
    "medium_returns",
    "high_returns",
    "calculated_score",
  ];

  // Función para ordenar valores según CREATE_FIELD_ORDER
  const getOrderedEntries = (
    obj: Record<string, unknown>,
  ): [string, unknown][] => {
    const entries = Object.entries(obj);
    return entries.sort(([keyA], [keyB]) => {
      const indexA = CREATE_FIELD_ORDER.indexOf(keyA);
      const indexB = CREATE_FIELD_ORDER.indexOf(keyB);

      // Los campos en el array van primero en ese orden
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // Si uno está en el array y el otro no, el que está en el array va primero
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      // Si ninguno está en el array, mantener orden original
      return 0;
    });
  };

  // Función para renderizar cambios en Squads (UPDATE)
  const renderSquadChanges = (oldSquads: unknown, newSquads: unknown) => {
    const changes = detectSquadChanges(oldSquads, newSquads);

    if (changes.length === 0) {
      return (
        <div className="text-gray-500 text-sm italic">
          Sin cambios en equipos
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {changes.map((change) => (
          <div
            key={change.squad}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Squad Header */}
            <div className="px-4 py-2.5 font-semibold bg-gray-200 text-gray-900 text-sm">
              {change.squad}
            </div>

            {/* Cambios */}
            <div className="divide-y divide-gray-200">
              {/* Bajas */}
              {change.low.old !== change.low.new && (
                <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                  <span className="text-sm font-medium text-gray-700">
                    Bajas:
                  </span>
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-gray-600 mb-1">Anterior</div>
                    <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.low.old}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-gray-500 font-bold text-lg">→</div>
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                      <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                        {change.low.new}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Medias */}
              {change.medium.old !== change.medium.new && (
                <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                  <span className="text-sm font-medium text-gray-700">
                    Medias:
                  </span>
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-gray-600 mb-1">Anterior</div>
                    <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.medium.old}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-gray-500 font-bold text-lg">→</div>
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                      <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                        {change.medium.new}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Graves */}
              {change.high.old !== change.high.new && (
                <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                  <span className="text-sm font-medium text-gray-700">
                    Graves:
                  </span>
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-gray-600 mb-1">Anterior</div>
                    <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.high.old}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-gray-500 font-bold text-lg">→</div>
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                      <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                        {change.high.new}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nota */}
              {change.score.old !== change.score.new && (
                <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center bg-blue-100">
                  <span className="text-sm font-bold text-blue-700">Nota:</span>
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-gray-600 mb-1">Anterior</div>
                    <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-3 py-2 rounded font-semibold text-sm w-full text-center num">
                      {formatScore(change.score.old)}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-gray-500 font-bold text-lg">→</div>
                    <div className="flex flex-col items-center flex-1">
                      <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                      <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-2 rounded font-semibold text-sm w-full text-center num">
                        {formatScore(change.score.new)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Notas Adicionales */}
              {change.additional_notes.old !== change.additional_notes.new && (
                <div className="px-4 py-3 grid grid-cols-1 gap-4 items-start bg-blue-200/30">
                  <span className="text-sm font-bold text-blue-700">
                    Notas Adicionales:
                  </span>
                  <div className="flex gap-3 w-full">
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 mb-1">Anterior</div>
                      <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-3 py-2 rounded text-sm w-full min-h-[60px] max-h-[100px] overflow-y-auto">
                        {change.additional_notes.old || (
                          <span className="italic text-gray-600">
                            Sin notas
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-500 font-bold text-lg flex items-center">
                      →
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                      <div className="bg-emerald-950/60 border border-emerald-800/50 text-emerald-400 px-3 py-2 rounded text-sm w-full min-h-[60px] max-h-[100px] overflow-y-auto">
                        {change.additional_notes.new || (
                          <span className="italic text-gray-600">
                            Sin notas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Función para renderizar Squads sin comparación (CREATE/DELETE)
  const renderSquadsSimple = (
    squads: unknown,
    colorClass: string = "bg-green-50 border-green-200",
  ) => {
    const squadsList = Array.isArray(squads) ? squads : [];

    if (squadsList.length === 0) {
      return <div className="text-gray-500 text-sm italic">Sin equipos</div>;
    }

    return (
      <div className="space-y-3">
        {squadsList.map((squad: Partial<TaskSquad>, idx: number) => {
          const bajas = squad.low_returns || 0;
          const medias = squad.medium_returns || 0;
          const graves = squad.high_returns || 0;
          const score = calculateTaskScore({
            lowReturns: bajas,
            mediumReturns: medias,
            highReturns: graves,
          });

          // Filtrar solo devoluciones que tienen valor > 0
          const changes = [];
          if (bajas > 0) changes.push(`Bajas: ${bajas}`);
          if (medias > 0) changes.push(`Medias: ${medias}`);
          if (graves > 0) changes.push(`Graves: ${graves}`);

          return (
            <div
              key={idx}
              className={`border rounded-lg overflow-hidden ${colorClass} bg-opacity-30`}
            >
              <div
                className={`border-b px-4 py-2.5 font-semibold text-gray-800 ${colorClass}`}
              >
                <span>{squad.squad}</span>
              </div>
              {changes.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    {changes.map((change, idx) => (
                      <div key={idx} className="py-2 text-sm text-gray-700">
                        {change}
                      </div>
                    ))}
                  </div>

                  {/* Fila de Nota */}
                  <div className="px-4 py-3 bg-blue-50 text-center">
                    <span className="text-sm font-bold text-blue-800">
                      Nota:{" "}
                      <span className="font-bold text-lg">
                        {formatScore(score)}/10
                      </span>
                    </span>
                  </div>

                  {/* Notas Adicionales */}
                  {squad.additional_notes && (
                    <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
                      <div className="text-xs font-semibold text-blue-900 mb-1">
                        Notas Adicionales:
                      </div>
                      <div className="text-sm text-blue-800 max-h-20 overflow-y-auto">
                        {squad.additional_notes}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  <div className="px-4 py-3 text-sm text-gray-500 italic">
                    Sin devoluciones registradas
                  </div>

                  {/* Fila de Nota */}
                  <div className="px-4 py-3 bg-blue-50 text-center">
                    <span className="text-sm font-bold text-blue-800">
                      Nota:{" "}
                      <span className="font-bold text-lg">
                        {formatScore(score)}/10
                      </span>
                    </span>
                  </div>

                  {/* Notas Adicionales */}
                  {squad.additional_notes && (
                    <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
                      <div className="text-xs font-semibold text-blue-900 mb-1">
                        Notas Adicionales:
                      </div>
                      <div className="text-sm text-blue-800 max-h-20 overflow-y-auto">
                        {squad.additional_notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">
              Trazabilidad de Auditoría
            </h1>
            <p className="text-sm text-gray-600">
              Historial completo de acciones realizadas en tareas, reportes y
              timings
            </p>
          </div>
          <SkeletonAuditTable isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  if (!user) {
    return <div className="p-4">No autenticado</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CacheWarningBanner show={hasError} />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Trazabilidad de Auditoría
          </h1>
          <p className="text-gray-600">
            Historial completo de acciones realizadas en tareas, reportes y
            timings
          </p>
        </div>

        {/* Filters */}
        <div
          className="bg-gray-100 border border-gray-200 rounded-xl mb-2 p-5"
          data-tour="audit-filters"
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-600">
              Filtros
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="audit-entity-type"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Tipo de Entidad
              </label>
              <select
                id="audit-entity-type"
                value={filters.entityType}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    entityType: e.target.value,
                    offset: 0,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                <option value="TASK">Tareas</option>
                <option value="REPORT">Reportes</option>
                <option value="TIMING">Timings</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-action"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Acción
              </label>
              <select
                id="audit-action"
                value={filters.action}
                onChange={(e) =>
                  setFilters({ ...filters, action: e.target.value, offset: 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todos</option>
                <option value="CREATE">Crear</option>
                <option value="UPDATE">Actualizar</option>
                <option value="DELETE">Eliminar</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="audit-limit"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Límite
              </label>
              <select
                id="audit-limit"
                value={filters.limit}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    limit: parseInt(e.target.value),
                    offset: 0,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({
                    ...filters,
                    entityType: "",
                    action: "",
                    offset: 0,
                  })
                }
                className="w-full px-3 py-2 border border-red-500/40 hover:border-red-500/70 hover:bg-red-950/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                aria-label="Limpiar todos los filtros"
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Botón Actualizar */}
        <div className="flex justify-end mb-6">
          <button
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Actualizar registros"
          >
            <RefreshCw
              size={18}
              className={isRefreshing ? "animate-spin" : ""}
            />
            Actualizar
          </button>
        </div>

        {/* Audit Logs Table */}
        <div
          className="bg-gray-100 border border-gray-200 rounded-xl overflow-hidden"
          data-tour="audit-table"
        >
          {loading ? (
            // Mostrar skeleton mientras carga (primera vez o caché expirado)
            <SkeletonAuditTable isAdmin={isAdmin} />
          ) : hasError ? (
            // Solo mostrar error después de que fallen todos los reintentos
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="text-red-600 mb-4">
                  <svg
                    className="w-16 h-16 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Error al cargar los registros
                </h3>
                <p className="text-gray-600 mb-6">
                  {fetchError ||
                    "Ocurrió un error al consultar los registros. Por favor, intenta nuevamente."}
                </p>
                <button
                  onClick={handleRefresh}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <RefreshCw size={18} />
                  Reintentar
                </button>
              </div>
            </div>
          ) : auditLogs.length === 0 ? (
            // Sin resultados (búsqueda vacía)
            <div className="p-8 text-center text-gray-600">
              <p>No hay registros de auditoría para mostrar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha y Hora
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Entidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detalles
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-100 divide-y divide-gray-200">
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-gray-200 transition cursor-pointer"
                      data-tour="audit-expand"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {log.user_email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(
                            log.action,
                          )}`}
                        >
                          {translateAction(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEntityBadgeColor(
                            log.entity_type,
                          )}`}
                        >
                          {translateEntityType(log.entity_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.entity_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center justify-center w-8 h-8 text-blue-600 hover:bg-blue-50 rounded-full transition"
                          title="Ver detalles"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && auditLogs.length > 0 && (
          <div
            className="mt-6 flex items-center justify-between"
            data-tour="audit-pagination"
          >
            <div className="text-sm text-gray-600">
              Mostrando {filters.offset + 1} a{" "}
              {Math.min(filters.offset + filters.limit, pagination.total)} de{" "}
              {pagination.total} registros
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setFilters({
                    ...filters,
                    offset: Math.max(0, filters.offset - filters.limit),
                  })
                }
                disabled={filters.offset === 0}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() =>
                  setFilters({
                    ...filters,
                    offset: filters.offset + filters.limit,
                  })
                }
                disabled={filters.offset + filters.limit >= pagination.total}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mt-8 bg-blue-100 border border-blue-200 rounded-xl p-5">
          <h3 className="font-semibold text-blue-700 mb-2 text-sm">
            Información Registrada:
          </h3>
          <ul className="text-xs text-blue-600 space-y-1">
            <li>✓ Fecha y Hora: Momento exacto de la acción</li>
            <li>✓ Usuario: Email del usuario que realizó la acción</li>
            <li>✓ Cambios: Detalles de qué se modificó (para UPDATE)</li>
          </ul>
        </div>
      </div>
      {/* Modal de Detalles */}
      {selectedLog && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 backdrop-blur-sm z-40"
            onClick={() => setSelectedLog(null)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Detalles de auditoría"
              data-testid="audit-detail-modal"
              className="bg-gray-100 border border-gray-200 rounded-2xl shadow-2xl shadow-black/50 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-center sticky top-0 bg-gray-100 border-b border-gray-200 p-5">
                <h3 className="text-base font-semibold text-gray-900">
                  Detalles de {translateAction(selectedLog.action)}
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Cerrar modal"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {/* Información General */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    Información General
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Fecha y Hora</p>
                      <p className="text-gray-900 font-medium mt-1">
                        {formatDate(selectedLog.timestamp)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Usuario</p>
                      <p className="text-gray-900 font-medium mt-1">
                        {selectedLog.user_email}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Acción</p>
                      <p className="text-gray-900 font-medium mt-1">
                        {translateAction(selectedLog.action)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Entidad</p>
                      <p className="text-gray-900 font-medium mt-1">
                        {translateEntityType(selectedLog.entity_type)}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Nombre de Entidad</p>
                      <p className="text-gray-900 font-medium mt-1">
                        {selectedLog.entity_name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vista minimalista para UPDATE */}
                {selectedLog.action === "UPDATE" &&
                  selectedLog.changes &&
                  Object.keys(selectedLog.changes).length > 0 && (
                    <div className="space-y-6">
                      {/* Cambios en la Tarea - Solo aparece si hay cambios */}
                      {(() => {
                        const filteredChanges = getOrderedEntries(
                          selectedLog.changes,
                        ).filter(([key]) => {
                          // Omitir squads ya que se mostrará abajo
                          if (key === "squads") return false;
                          if (key === "squad") return false;
                          return true;
                        });

                        if (filteredChanges.length === 0) {
                          return null; // No mostrar la sección si no hay cambios
                        }

                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">
                              Cambios en la Tarea
                            </h4>
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                              {/* Encabezados */}
                              <div className="grid grid-cols-2 bg-gray-200 border-b border-gray-200">
                                <div className="px-4 py-3 font-semibold text-sm text-gray-700">
                                  Valor Anterior
                                </div>
                                <div className="px-4 py-3 font-semibold text-sm text-gray-700 border-l border-gray-200">
                                  Valor Nuevo
                                </div>
                              </div>
                              {/* Filas de cambios */}
                              <div className="divide-y divide-gray-200">
                                {filteredChanges.map(([key]) => {
                                  const oldValue =
                                    selectedLog.old_values?.[key];
                                  const newValue =
                                    selectedLog.new_values?.[key];
                                  return (
                                    <div
                                      key={key}
                                      className="grid grid-cols-2 bg-gray-100"
                                    >
                                      {/* Valor Anterior */}
                                      <div className="px-4 py-4 text-sm">
                                        <div className="text-xs font-medium text-gray-600 mb-1">
                                          {getFieldLabel(key)}
                                        </div>
                                        <div className="text-red-400 bg-red-950/30 border border-red-800/30 px-3 py-2 rounded font-mono text-xs">
                                          {key === "task_link" &&
                                          typeof oldValue === "string" ? (
                                            <a
                                              href={oldValue}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline break-all"
                                            >
                                              {oldValue}
                                            </a>
                                          ) : (
                                            cleanJsonValue(oldValue, key)
                                          )}
                                        </div>
                                      </div>
                                      {/* Valor Nuevo */}
                                      <div className="px-4 py-4 text-sm border-l border-gray-200">
                                        <div className="text-xs font-medium text-gray-600 mb-1">
                                          {getFieldLabel(key)}
                                        </div>
                                        <div className="text-emerald-400 bg-emerald-950/30 border border-emerald-800/30 px-3 py-2 rounded font-mono text-xs">
                                          {key === "task_link" &&
                                          typeof newValue === "string" ? (
                                            <a
                                              href={newValue}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline break-all"
                                            >
                                              {newValue}
                                            </a>
                                          ) : (
                                            cleanJsonValue(newValue, key)
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Cambios en Equipos */}
                      {selectedLog.changes?.squads && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            Cambios en Equipos
                          </h4>
                          {renderSquadChanges(
                            selectedLog.changes.squads?.old,
                            selectedLog.changes.squads?.new,
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* Vista para CREATE */}
                {selectedLog.action === "CREATE" &&
                  selectedLog.entity_type === "TASK" &&
                  selectedLog.new_values &&
                  Object.keys(selectedLog.new_values).length > 0 && (
                    <div className="space-y-6">
                      {/* Valores de la Tarea */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">
                          Valores de la Tarea
                        </h4>
                        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4 text-sm space-y-2">
                          {getOrderedEntries(selectedLog.new_values)
                            .filter(([key, value]) => {
                              // Omitir campos innecesarios
                              if (key === "squads") return false;
                              if (key === "squad") return false;
                              if (key === "additional_notes") return false;
                              if (key === "id") return false;
                              if (key === "user_id") return false;
                              if (key === "created_at") return false;
                              if (key === "updated_at") return false;
                              // Omitir devoluciones con valor 0
                              if (
                                [
                                  "low_returns",
                                  "medium_returns",
                                  "high_returns",
                                ].includes(key) &&
                                value === 0
                              )
                                return false;
                              // Omitir nota calculada nula
                              if (key === "calculated_score" && value === null)
                                return false;
                              return true;
                            })
                            .map(([key, value]) => (
                              <div
                                key={key}
                                className="flex justify-between gap-4"
                              >
                                <span className="text-gray-700 font-medium">
                                  {getFieldLabel(key)}:
                                </span>
                                <span className="text-gray-900 text-right font-mono">
                                  {key === "task_link" &&
                                  typeof value === "string" ? (
                                    <a
                                      href={value}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline break-all"
                                    >
                                      {value}
                                    </a>
                                  ) : (
                                    cleanJsonValue(value, key)
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Equipos */}
                      {selectedLog.new_values?.squads && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            Equipos
                          </h4>
                          {renderSquadsSimple(
                            selectedLog.new_values.squads,
                            "bg-emerald-950/30 border-emerald-800/40",
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* Vista para DELETE */}
                {selectedLog.action === "DELETE" &&
                  selectedLog.entity_type === "TASK" &&
                  selectedLog.old_values &&
                  Object.keys(selectedLog.old_values).length > 0 && (
                    <div className="space-y-6">
                      {/* Valores de la Tarea */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">
                          Valores de la Tarea
                        </h4>
                        <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 text-sm space-y-2">
                          {getOrderedEntries(selectedLog.old_values)
                            .filter(([key, value]) => {
                              // Omitir campos innecesarios
                              if (key === "squads") return false;
                              if (key === "squad") return false;
                              if (key === "additional_notes") return false;
                              if (key === "id") return false;
                              if (key === "user_id") return false;
                              if (key === "created_at") return false;
                              if (key === "updated_at") return false;
                              // Omitir devoluciones con valor 0
                              if (
                                [
                                  "low_returns",
                                  "medium_returns",
                                  "high_returns",
                                ].includes(key) &&
                                value === 0
                              )
                                return false;
                              // Omitir nota calculada nula
                              if (key === "calculated_score" && value === null)
                                return false;
                              return true;
                            })
                            .map(([key, value]) => (
                              <div
                                key={key}
                                className="flex justify-between gap-4"
                              >
                                <span className="text-gray-700 font-medium">
                                  {getFieldLabel(key)}:
                                </span>
                                <span className="text-gray-900 text-right font-mono">
                                  {key === "task_link" &&
                                  typeof value === "string" ? (
                                    <a
                                      href={value}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline break-all"
                                    >
                                      {value}
                                    </a>
                                  ) : (
                                    cleanJsonValue(value, key)
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Equipos */}
                      {selectedLog.old_values?.squads && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            Equipos
                          </h4>
                          {renderSquadsSimple(
                            selectedLog.old_values.squads,
                            "bg-red-950/30 border-red-800/40",
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* Vista TIMING — CREATE */}
                {selectedLog.action === "CREATE" &&
                  selectedLog.entity_type === "TIMING" &&
                  selectedLog.new_values && (
                    <div className="space-y-4">
                      <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4 text-sm space-y-2">
                        {(["month", "year", "task_id"] as const)
                          .filter(
                            (k) => selectedLog.new_values?.[k] !== undefined,
                          )
                          .map((key) => (
                            <div
                              key={key}
                              className="flex justify-between gap-4"
                            >
                              <span className="text-gray-700 font-medium">
                                {getFieldLabel(key)}:
                              </span>
                              <span className="text-gray-900 text-right font-mono">
                                {cleanJsonValue(
                                  selectedLog.new_values![key],
                                  key,
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                      {Array.isArray(selectedLog.new_values.qa_entries) && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            QA Entries Creados
                          </h4>
                          <div className="space-y-2">
                            {(
                              selectedLog.new_values.qa_entries as {
                                qa_name: string;
                                hours_by_category: Record<string, number>;
                              }[]
                            ).map((entry, i) => {
                              const total = Object.values(
                                entry.hours_by_category ?? {},
                              ).reduce((s, h) => s + (h as number), 0);
                              return (
                                <div
                                  key={i}
                                  className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg px-4 py-3 text-sm flex justify-between"
                                >
                                  <span className="font-medium text-gray-900">
                                    {entry.qa_name}
                                  </span>
                                  <span className="text-gray-600 font-mono">
                                    {total.toFixed(2)} h
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                {/* Vista TIMING — UPDATE */}
                {selectedLog.action === "UPDATE" &&
                  selectedLog.entity_type === "TIMING" &&
                  selectedLog.new_values && (
                    <div className="space-y-4">
                      {Array.isArray(selectedLog.new_values.qa_entries) && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">
                            QA Entries Actualizados
                          </h4>
                          <div className="space-y-2">
                            {(
                              selectedLog.new_values.qa_entries as {
                                qa_name: string;
                                hours_by_category: Record<string, number>;
                              }[]
                            ).map((entry, i) => {
                              const total = Object.values(
                                entry.hours_by_category ?? {},
                              ).reduce((s, h) => s + (h as number), 0);
                              return (
                                <div
                                  key={i}
                                  className="bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-sm flex justify-between"
                                >
                                  <span className="font-medium text-gray-900">
                                    {entry.qa_name}
                                  </span>
                                  <span className="text-gray-600 font-mono">
                                    {total.toFixed(2)} h
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {selectedLog.new_values.synced_by === "clickup-cron" && (
                        <div className="bg-amber-950/20 border border-amber-700/40 rounded-lg p-4 text-sm">
                          <p className="text-amber-300 font-medium">
                            Sincronización automática vía ClickUp Cron
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {/* Vista TIMING — DELETE */}
                {selectedLog.action === "DELETE" &&
                  selectedLog.entity_type === "TIMING" &&
                  selectedLog.old_values && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">
                        Timing Eliminado
                      </h4>
                      <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 text-sm space-y-2">
                        {(["month", "year", "task_id"] as const)
                          .filter(
                            (k) => selectedLog.old_values?.[k] !== undefined,
                          )
                          .map((key) => (
                            <div
                              key={key}
                              className="flex justify-between gap-4"
                            >
                              <span className="text-gray-700 font-medium">
                                {getFieldLabel(key)}:
                              </span>
                              <span className="text-gray-900 text-right font-mono">
                                {cleanJsonValue(
                                  selectedLog.old_values![key],
                                  key,
                                )}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </>
      )}{" "}
    </div>
  );
}
