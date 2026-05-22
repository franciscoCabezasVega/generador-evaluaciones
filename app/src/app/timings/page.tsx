"use client";

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { useCachedFetch, invalidateCache } from "@/hooks/useCachedFetch";
import { useAuth } from "@/contexts/AuthContext";
import { useMutationQueue } from "@/contexts/MutationQueueContext";
import Navbar from "@/components/Navbar";
import TimingForm from "@/components/TimingForm";
import TimingsList from "@/components/TimingsList";
import Modal from "@/components/Modal";
import { SkeletonTable } from "@/components/Skeleton";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import {
  TimingMetricsDistributionChart,
  TimingMetricsComparisonChart,
  SquadTimingSummaryCard,
  QAHoursBarChart,
  QAEfficiencyChart,
  QASummaryCards,
  TshirtSizeComparison,
} from "@/components/TimingMetrics";
import {
  Task,
  TaskTiming,
  TaskWithTiming,
  CreateTaskTimingInput,
  UpdateTaskTimingInput,
  SquadTimingMetrics,
  QATimingMetrics,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3, List, Users } from "lucide-react";

export default function TimingsPage() {
  const [submitting, setSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const { products } = useCatalogData();
  const [showForm, setShowForm] = useState(false);
  const [editingTiming, setEditingTiming] = useState<TaskTiming | null>(null);
  const [registeringTask, setRegisteringTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const formRef = useRef<{ handleCancelWithConfirm: () => void }>(null);

  // Filtros — rango de fechas en vez de mes/año
  const [filters, setFilters] = useState({
    dateRange: {
      startDate: startOfMonth(new Date()),
      endDate: endOfMonth(new Date()),
    } as DateRange,
    productType: "",
  });

  // Helper: format dates for API
  const apiStartDate = format(filters.dateRange.startDate, "yyyy-MM-dd");
  const apiEndDate = format(filters.dateRange.endDate, "yyyy-MM-dd");

  const [viewMode, setViewMode] = useState<"list" | "metrics" | "qa-metrics">(
    "list",
  );

  // Invalidar la caché de la vista que se activa para forzar datos frescos.
  // Evita que el usuario vea datos stale al cambiar de tab.
  // Guard de primer render: viewMode inicia en "list" pero no queremos borrar
  // el caché en el mount inicial — solo en cambios explícitos del usuario.
  const viewModeInitialized = useRef(false);
  useEffect(() => {
    if (!viewModeInitialized.current) {
      viewModeInitialized.current = true;
      return;
    }
    if (viewMode === "metrics") invalidateCache("timings-metrics");
    if (viewMode === "qa-metrics") invalidateCache("timings-qa-metrics");
    if (viewMode === "list") invalidateCache("timings");
  }, [viewMode, invalidateCache]);

  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { safeFetch } = useSafeAuthFetch();
  const { enqueue } = useMutationQueue();

  // Redirigir a login si no hay sesión
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  const isEnabled = !authLoading && !!user;

  // Filtros serializados para los hooks de caché
  const timingFilters = {
    start_date: apiStartDate,
    end_date: apiEndDate,
    product_type: filters.productType,
  };
  const taskFilters = {
    product_type: filters.productType,
    dateRange: `${apiStartDate}_${apiEndDate}`,
  };

  // ===== Tasks (vista virtual: filtradas por effort_score_date en rango) =====
  const { data: tasks, loading: tasksLoading } = useCachedFetch<Task[]>({
    cacheKey: "timings-tasks",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const params = new URLSearchParams();
        params.append("start_date", apiStartDate);
        params.append("end_date", apiEndDate);
        if (filters.productType)
          params.append("product_type", filters.productType);
        const res = await safeFetch(`/api/tasks?${params.toString()}`, {
          signal,
        });
        return res.ok ? await res.json() : [];
      },
      [apiStartDate, apiEndDate, filters.productType, safeFetch],
    ),
    filters: taskFilters,
    enabled: isEnabled,
    initialData: [],
  });

  // ===== Timings =====
  const {
    data: timings,
    loading,
    isRefreshing,
    refresh: refreshTimings,
    invalidate: invalidateTimings,
    setData: setTimings,
  } = useCachedFetch<TaskTiming[]>({
    cacheKey: "timings",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const params = new URLSearchParams();
        params.append("start_date", apiStartDate);
        params.append("end_date", apiEndDate);
        if (filters.productType)
          params.append("product_type", filters.productType);
        const response = await safeFetch(`/api/timings?${params.toString()}`, {
          signal,
        });
        if (!response.ok) throw new Error("Error al cargar tiempos");
        return await response.json();
      },
      [apiStartDate, apiEndDate, filters.productType, safeFetch],
    ),
    filters: timingFilters,
    enabled: isEnabled,
    initialData: [],
  });

  // ===== Metrics =====
  const {
    data: metrics,
    loading: metricsLoading,
    refresh: refreshMetrics,
  } = useCachedFetch<SquadTimingMetrics[]>({
    cacheKey: "timings-metrics",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const params = new URLSearchParams();
        params.append("start_date", apiStartDate);
        params.append("end_date", apiEndDate);
        if (filters.productType)
          params.append("product_type", filters.productType);
        const response = await safeFetch(
          `/api/timings/metrics?${params.toString()}`,
          { signal },
        );
        if (!response.ok) throw new Error("Error al cargar métricas");
        return await response.json();
      },
      [apiStartDate, apiEndDate, filters.productType, safeFetch],
    ),
    filters: timingFilters,
    enabled: isEnabled,
    initialData: [],
  });

  // ===== QA Metrics =====
  const {
    data: qaMetrics,
    loading: qaMetricsLoading,
    refresh: refreshQAMetrics,
  } = useCachedFetch<QATimingMetrics[]>({
    cacheKey: "timings-qa-metrics",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const params = new URLSearchParams();
        params.append("start_date", apiStartDate);
        params.append("end_date", apiEndDate);
        if (filters.productType)
          params.append("product_type", filters.productType);
        const response = await safeFetch(
          `/api/timings/metrics/qa?${params.toString()}`,
          { signal },
        );
        if (!response.ok) throw new Error("Error al cargar métricas QA");
        return await response.json();
      },
      [apiStartDate, apiEndDate, filters.productType, safeFetch],
    ),
    filters: timingFilters,
    enabled: isEnabled,
    initialData: [],
  });

  // ===== All Timings (sin filtros, para TshirtSizeComparison) =====
  const {
    data: allTimings,
    loading: allTimingsLoading,
    refresh: refreshAllTimings,
  } = useCachedFetch<TaskTiming[]>({
    cacheKey: "timings-all-comparison",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const response = await safeFetch("/api/timings", { signal });
        if (!response.ok) throw new Error("Error al cargar todos los tiempos");
        return await response.json();
      },
      [safeFetch],
    ),
    filters: {},
    enabled: isEnabled,
    initialData: [],
  });

  // ===== All Tasks (sin filtros, para TshirtSizeComparison) =====
  const { data: allTasks, loading: allTasksLoading } = useCachedFetch<Task[]>({
    cacheKey: "timings-all-tasks-comparison",
    fetchFn: useCallback(
      async (signal: AbortSignal) => {
        const response = await safeFetch("/api/tasks", { signal });
        if (!response.ok) throw new Error("Error al cargar todas las tareas");
        return await response.json();
      },
      [safeFetch],
    ),
    filters: {},
    enabled: isEnabled,
    initialData: [],
  });

  // Refresh que invalida todos los cachés de timings
  const handleRefreshAll = useCallback(() => {
    refreshTimings();
    refreshMetrics();
    refreshQAMetrics();
    refreshAllTimings();
  }, [refreshTimings, refreshMetrics, refreshQAMetrics, refreshAllTimings]);

  // Handle crear/editar timing
  const handleSubmit = async (
    data: CreateTaskTimingInput | UpdateTaskTimingInput,
  ) => {
    try {
      setSubmitting(true);

      if (editingTiming) {
        const response = await safeFetch(`/api/timings/${editingTiming.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al actualizar");
        }

        const updatedTiming = await response.json();
        setTimings((prev) =>
          prev.map((t) => (t.id === editingTiming.id ? updatedTiming : t)),
        );
      } else {
        // Crear nuevo timing (desde flujo normal o desde vista virtual)
        const response = await safeFetch("/api/timings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Error al crear");
        }

        const newTiming = await response.json();
        setTimings((prev) => [newTiming, ...prev]);
      }

      setShowForm(false);
      setEditingTiming(null);
      setRegisteringTask(null);
      // Invalidar métricas en background
      invalidateCache("timings-metrics");
      invalidateCache("timings-qa-metrics");
      invalidateCache("timings-all-comparison");
      refreshMetrics();
      refreshQAMetrics();
      refreshAllTimings();
    } catch (error: unknown) {
      console.error("Error:", error);
      alert(error instanceof Error ? error.message : "Ocurrió un error");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Crea el timing en background sin cerrar el modal — usado por el flujo
   * de "Sincronizar en un clic" desde ClickUpSyncInline.
   * Retorna el nuevo timing ID, o null si falla.
   */
  const handleCreateForSync = async (
    data: import("@/lib/types").CreateTaskTimingInput,
  ): Promise<string | null> => {
    const response = await safeFetch("/api/timings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorMsg = "Error al guardar el timing";
      try {
        const errBody = (await response.json()) as { error?: string };
        if (errBody?.error) errorMsg = errBody.error;
      } catch {
        /* ignore parse error */
      }
      throw new Error(errorMsg);
    }
    const newTiming =
      (await response.json()) as import("@/lib/types").TaskTiming;
    setTimings((prev) => [newTiming, ...prev]);
    // Pasar a modo edición sin cerrar el modal para que el sync pueda continuar
    setRegisteringTask(null);
    setEditingTiming(newTiming);
    invalidateCache("timings-metrics");
    invalidateCache("timings-qa-metrics");
    invalidateCache("timings-all-comparison");
    return newTiming.id;
  };

  // Handle eliminar timing
  const handleDelete = async (id: string) => {
    // Optimistic update: quitar de la lista inmediatamente
    setTimings((prev) => prev.filter((t) => t.id !== id));
    setDeleteConfirm(null);

    enqueue({
      url: `/api/timings/${id}`,
      method: "DELETE",
      cacheKeys: [
        "timings",
        "timings-metrics",
        "timings-qa-metrics",
        "timings-all-comparison",
      ],
      onSuccess: () => {
        refreshMetrics();
        refreshQAMetrics();
        refreshAllTimings();
      },
      onRollback: () => {
        // Restaurar la lista si el DELETE falla permanentemente
        invalidateTimings();
      },
    });
  };

  // Handle editar timing — siempre fetchea datos frescos del servidor para
  // evitar que el form se abra con valores stale del cache del listado.
  // Esto garantiza que el usuario vea (y eventualmente guarde) el estado
  // real de la DB, incluso si el cron actualizó el timing mientras tanto.
  const handleEdit = async (timing: TaskTiming) => {
    setEditLoading(true);
    try {
      const response = await safeFetch(`/api/timings/${timing.id}`);
      const fresh: TaskTiming = response.ok ? await response.json() : timing;
      setEditingTiming(fresh);
    } catch {
      // Fallback: abrir con datos del listado si el fetch falla
      setEditingTiming(timing);
    } finally {
      setEditLoading(false);
    }
    setRegisteringTask(null);
    setShowForm(true);
  };

  // Handle registrar tiempo desde la vista virtual
  const handleRegisterTime = (task: Task) => {
    setRegisteringTask(task);
    setEditingTiming(null);
    setShowForm(true);
  };

  // Handle cancelar form
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingTiming(null);
    setRegisteringTask(null);
  };

  // Handle cancelar form con confirmación (para header close)
  const handleCancelFormWithConfirm = () => {
    formRef.current?.handleCancelWithConfirm();
  };

  // Vista virtual: merge de tasks y timings
  const entries = useMemo((): TaskWithTiming[] => {
    const timingsByTaskId = new Map<string, (typeof timings)[number]>();
    for (const t of timings) {
      timingsByTaskId.set(t.task_id, t);
    }
    return tasks.map((task) => ({
      ...task,
      timing: timingsByTaskId.get(task.id),
    }));
  }, [tasks, timings]);

  if (authLoading || !user) {
    return <SkeletonTable />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* CacheWarningBanner no se muestra aquí: el auto-retry silencioso
            maneja la reconexión sin interrumpir al usuario. */}
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Gestión de Tiempos
          </h1>
          <p className="mt-2 text-gray-600">
            Registra y visualiza los tiempos de QA por fases: Testing Efectivo,
            Espera Ambiente, Espera Fixes, Retest y Clarificaciones
          </p>
        </div>

        {/* Controles */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
          {/* Ver modo */}
          <div className="flex gap-2">
            <Button
              onClick={() => setViewMode("list")}
              variant={viewMode === "list" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <List size={20} />
              Lista
            </Button>
            <Button
              onClick={() => setViewMode("metrics")}
              variant={viewMode === "metrics" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <BarChart3 size={20} />
              Métricas
            </Button>
            <Button
              onClick={() => setViewMode("qa-metrics")}
              variant={viewMode === "qa-metrics" ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              <Users size={20} />
              QA
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-gray-100 p-4">
          <h3 className="mb-4 font-semibold text-gray-900">Filtros</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="date-range-picker-trigger"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Rango de fechas
              </label>
              <DateRangePicker
                value={filters.dateRange}
                onChange={(range) =>
                  setFilters((prev) => ({
                    ...prev,
                    dateRange: range,
                  }))
                }
              />
            </div>

            <div>
              <label
                htmlFor="filters-product-type"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Producto
              </label>
              <select
                id="filters-product-type"
                name="productType"
                value={filters.productType}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    productType: e.target.value,
                  }))
                }
                className="mt-0 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Todos los productos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Botón de actualizar para métricas */}
        {(viewMode === "metrics" || viewMode === "qa-metrics") && (
          <div className="mb-8 flex justify-end">
            <button
              onClick={handleRefreshAll}
              disabled={metricsLoading || qaMetricsLoading || isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Actualizar métricas"
            >
              <RefreshCw
                size={18}
                className={isRefreshing ? "animate-spin" : ""}
              />
              Actualizar
            </button>
          </div>
        )}

        {/* Contenido principal */}
        {viewMode === "list" ? (
          <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Tareas del período
              </h2>
              <button
                onClick={handleRefreshAll}
                disabled={loading || tasksLoading || isRefreshing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title="Actualizar tiempos"
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? "animate-spin" : ""}
                />
                Actualizar
              </button>
            </div>
            <TimingsList
              entries={entries}
              loading={loading || tasksLoading}
              editLoading={editLoading}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirm(id)}
              onRegister={handleRegisterTime}
            />
          </div>
        ) : viewMode === "metrics" ? (
          <div className="space-y-8">
            {/* Gráfico de distribución */}
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
              <TimingMetricsDistributionChart
                metrics={metrics}
                loading={metricsLoading}
              />
            </div>

            {/* Gráfico comparativo */}
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
              <TimingMetricsComparisonChart
                metrics={metrics}
                loading={metricsLoading}
              />
            </div>

            {/* Tarjetas de resumen detalladas */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Análisis Detallado por Producto
              </h2>
              {metrics.map((metric) => (
                <div key={metric.product_type}>
                  <SquadTimingSummaryCard metric={metric} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* QA Metrics view */
          <div className="space-y-8">
            {/* Bar chart de horas por QA */}
            <QAHoursBarChart qaMetrics={qaMetrics} loading={qaMetricsLoading} />

            {/* Tabla de eficiencia por QA */}
            <QAEfficiencyChart
              qaMetrics={qaMetrics}
              loading={qaMetricsLoading}
              timings={timings}
              tasks={tasks}
            />

            {/* Tarjetas resumen por QA - se oculta si no hay datos */}
            {!qaMetricsLoading && qaMetrics.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Resumen Individual por QA
                </h2>
                <QASummaryCards
                  qaMetrics={qaMetrics}
                  loading={qaMetricsLoading}
                />
              </div>
            )}

            {/* Comparativa por Complejidad y Tipo Proyecto */}
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
              <TshirtSizeComparison
                timings={allTimings}
                tasks={allTasks}
                loading={allTimingsLoading || allTasksLoading}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal de formulario */}
      <Modal
        isOpen={showForm}
        title={
          editingTiming
            ? `Actualizar Timing - ${tasks.find((t) => t.id === editingTiming?.task_id)?.name || "Tarea"}`
            : registeringTask
              ? `Registrar Tiempo - ${registeringTask.name}`
              : "Nuevo Timing"
        }
        onClose={handleCancelFormWithConfirm}
        onHeaderClose={handleCancelFormWithConfirm}
      >
        <TimingForm
          ref={formRef}
          onSubmit={handleSubmit}
          onCancel={handleCancelForm}
          initialData={editingTiming as Record<string, unknown> | null}
          isLoading={submitting}
          isEditing={!!editingTiming}
          availableTasks={tasks}
          selectedTaskIds={timings
            .filter((t) => t.id !== editingTiming?.id)
            .map((t) => t.task_id)}
          safeFetch={safeFetch}
          lockedTask={registeringTask ?? undefined}
          onQAChange={async (taskId: string, qaNames: string[]) => {
            const response = await safeFetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assigned_qa: qaNames }),
            });
            if (!response.ok) {
              let errorMessage = "No se pudo actualizar el QA asignado.";
              try {
                const errorData = (await response.json()) as { error?: string };
                if (errorData?.error) errorMessage = errorData.error;
              } catch {
                /* ignore parse error */
              }
              throw new Error(errorMessage);
            }
          }}
          onCreateForSync={!editingTiming ? handleCreateForSync : undefined}
        />
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal
        isOpen={!!deleteConfirm}
        title="Eliminar Timing"
        onClose={() => setDeleteConfirm(null)}
        size="md"
      >
        <div className="p-6">
          <p className="mb-6 text-gray-600">
            ¿Estás seguro de que deseas eliminar este timing? Esta acción no se
            puede deshacer.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => setDeleteConfirm(null)}
              variant="outline"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
