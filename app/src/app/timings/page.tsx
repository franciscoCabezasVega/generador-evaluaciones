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
  QAHoursBarChart,
  QAEfficiencyChart,
  QASummaryCards,
  TshirtSizeComparison,
} from "@/components/TimingMetrics";
import { TimingAnalyticsDashboard } from "@/components/TimingAnalyticsDashboard";
import { QAStatsDashboard } from "@/components/QAStatsDashboard";
import {
  Task,
  TaskTiming,
  TaskWithTiming,
  CreateTaskTimingInput,
  UpdateTaskTimingInput,
  SquadTimingMetrics,
  QATimingMetrics,
  CatalogTimingCategory,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import {
  formatTime,
  QA_NON_CONTROLLABLE_CATEGORY_SLUGS,
} from "@/lib/timingUtils";
import type {
  PDFChartData,
  PDFQAStatsData,
} from "@/components/TimingAnalyticsPDFDocument";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3, List, Users, FileDown } from "lucide-react";

export default function TimingsPage() {
  const [submitting, setSubmitting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const { products, timingCategories } = useCatalogData();
  const [showForm, setShowForm] = useState(false);
  const [editingTiming, setEditingTiming] = useState<TaskTiming | null>(null);
  const [registeringTask, setRegisteringTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const formRef = useRef<{ handleCancelWithConfirm: () => void }>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<
    "qa-manual" | "qa-automation" | "manual" | "automation"
  >("qa-manual");
  const AUTOMATION_QA = "Automatización QA";

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
  }, [viewMode]);

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

  // ── PDF data ────────────────────────────────────────────────────────────
  const QA_NON_CTRL_SET = new Set(QA_NON_CONTROLLABLE_CATEGORY_SLUGS);

  // Timings/tasks filtrados por sub-pestaña de analytics
  // Manual:       excluye project_type "Automatización QA" Y product_type "Automation"
  // Automatización: incluye cualquiera de los dos
  const AUTOMATION_PRODUCT = "Automation";
  const { manualTimings, manualTasks, automationTimings, automationTasks } =
    useMemo(() => {
      const tArr = timings ?? [];
      const tkArr = tasks ?? [];
      const taskMap = new Map(tkArr.map((t) => [t.id, t]));
      const isAutomation = (
        task:
          | { project_type?: string | null; product_type?: string | null }
          | undefined,
      ) =>
        task?.project_type === AUTOMATION_QA ||
        task?.product_type === AUTOMATION_PRODUCT;
      return {
        manualTimings: tArr.filter(
          (t) => !isAutomation(taskMap.get(t.task_id)),
        ),
        manualTasks: tkArr.filter((t) => !isAutomation(t)),
        automationTimings: tArr.filter((t) =>
          isAutomation(taskMap.get(t.task_id)),
        ),
        automationTasks: tkArr.filter((t) => isAutomation(t)),
      };
    }, [timings, tasks, AUTOMATION_QA, AUTOMATION_PRODUCT]);

  const { pdfDataManual, pdfDataAutomation } = useMemo<{
    pdfDataManual: PDFChartData | null;
    pdfDataAutomation: PDFChartData | null;
  }>(() => {
    if (!metrics || metrics.length === 0)
      return { pdfDataManual: null, pdfDataAutomation: null };
    const activeCategories = timingCategories.filter(
      (c: CatalogTimingCategory) => c.is_active && !QA_NON_CTRL_SET.has(c.slug),
    );
    const PALETTE = [
      "#F59E0B",
      "#3B82F6",
      "#8B5CF6",
      "#EC4899",
      "#10B981",
      "#EF4444",
      "#06B6D4",
      "#84CC16",
    ];
    const COMPLEXITY_COLORS: Record<string, string> = {
      XS: "#10B981",
      S: "#3B82F6",
      M: "#8B5CF6",
      L: "#F59E0B",
      XL: "#EC4899",
      XXL: "#EF4444",
    };
    const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];
    const fmtDateStr = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    };
    const dateRange = `${fmtDateStr(apiStartDate)} - ${fmtDateStr(apiEndDate)}`;

    function buildData(
      filteredTimings: TaskTiming[],
      filteredTasks: Task[],
    ): PDFChartData {
      let totalTimingHours = 0;
      const productHoursMap: Record<string, number> = {};
      const productTypeHoursMap: Record<string, number> = {};
      const complexityHoursMap: Record<string, number> = {};
      const dailyProductTypeMap: Record<string, Record<string, number>> = {};
      const timingTaskIds = new Set<string>();
      const taskMap = new Map(filteredTasks.map((t) => [t.id, t]));

      for (const t of filteredTimings) {
        totalTimingHours += t.total_hours ?? 0;
        timingTaskIds.add(t.task_id);
        const task = taskMap.get(t.task_id);
        if (task) {
          const pt = task.project_type ?? "Sin tipo";
          productHoursMap[pt] =
            (productHoursMap[pt] ?? 0) + (t.total_hours ?? 0);
          const ptype = task.product_type ?? "Sin producto";
          productTypeHoursMap[ptype] =
            (productTypeHoursMap[ptype] ?? 0) + (t.total_hours ?? 0);
          if (task.tshirt_size)
            complexityHoursMap[task.tshirt_size] =
              (complexityHoursMap[task.tshirt_size] ?? 0) +
              (t.total_hours ?? 0);
          if ((t.total_hours ?? 0) > 0) {
            const dateKey = (t.created_at ?? "").split("T")[0];
            if (dateKey) {
              if (!dailyProductTypeMap[dateKey])
                dailyProductTypeMap[dateKey] = {};
              dailyProductTypeMap[dateKey][ptype] =
                (dailyProductTypeMap[dateKey][ptype] ?? 0) +
                (t.total_hours ?? 0);
            }
          }
        }
      }

      const totalTimingTasks = timingTaskIds.size;
      const avgPerTask =
        totalTimingTasks > 0 ? totalTimingHours / totalTimingTasks : 0;
      const nActiveQAs = (qaMetrics ?? []).filter(
        (q) => q.total_hours > 0,
      ).length;
      const totalQAHours = (qaMetrics ?? []).reduce(
        (s, q) => s + q.total_hours,
        0,
      );
      const avgPerQA = nActiveQAs > 0 ? totalQAHours / nActiveQAs : 0;
      const avgEfficiency =
        (qaMetrics ?? []).length > 0
          ? (qaMetrics ?? []).reduce(
              (s, q) => s + (q.efficiency_rate ?? 0),
              0,
            ) / (qaMetrics ?? []).length
          : 0;

      const allProductTypes = Object.keys(productTypeHoursMap).sort(
        (a, b) => (productTypeHoursMap[b] ?? 0) - (productTypeHoursMap[a] ?? 0),
      );
      const productTypeSegments = allProductTypes.map((p, i) => ({
        label: p,
        hours: productTypeHoursMap[p],
        pct:
          totalTimingHours > 0
            ? (productTypeHoursMap[p] / totalTimingHours) * 100
            : 0,
        color: PALETTE[i % PALETTE.length],
      }));
      const productTypeColors: Record<string, string> = {};
      allProductTypes.forEach((p, i) => {
        productTypeColors[p] = PALETTE[i % PALETTE.length];
      });

      const sortedDates = Object.keys(dailyProductTypeMap).sort();
      const cumulativeTracker: Record<string, number> = {};
      allProductTypes.forEach((p) => {
        cumulativeTracker[p] = 0;
      });
      const cumulativeChartData = sortedDates.map((date) => {
        const entry: Record<string, string | number> = { date };
        for (const product of allProductTypes) {
          cumulativeTracker[product] =
            (cumulativeTracker[product] ?? 0) +
            (dailyProductTypeMap[date]?.[product] ?? 0);
          entry[product] = Math.round(cumulativeTracker[product] * 100) / 100;
        }
        return entry;
      });

      const allProjectTypes = Object.keys(productHoursMap).sort(
        (a, b) => (productHoursMap[b] ?? 0) - (productHoursMap[a] ?? 0),
      );
      const projectSegments = allProjectTypes.map((p, i) => ({
        label: p,
        hours: productHoursMap[p],
        pct:
          totalTimingHours > 0
            ? (productHoursMap[p] / totalTimingHours) * 100
            : 0,
        color: PALETTE[i % PALETTE.length],
      }));

      const complexitySegments = SIZE_ORDER.filter(
        (sz) => (complexityHoursMap[sz] ?? 0) > 0,
      )
        .map((sz) => ({
          size: sz,
          hours: complexityHoursMap[sz] ?? 0,
          pct:
            totalTimingHours > 0
              ? ((complexityHoursMap[sz] ?? 0) / totalTimingHours) * 100
              : 0,
          color: COMPLEXITY_COLORS[sz] ?? "#6B7280",
        }))
        .sort((a, b) => b.hours - a.hours);

      const top5Tasks = [...filteredTimings]
        .sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0))
        .slice(0, 5)
        .map((t) => {
          const task = taskMap.get(t.task_id);
          return { name: task?.name ?? t.task_id, hours: t.total_hours ?? 0 };
        });

      const qaDistMapPDF: Record<string, number> = {};
      for (const t of filteredTimings) {
        for (const entry of t.qa_entries ?? []) {
          qaDistMapPDF[entry.qa_name] =
            (qaDistMapPDF[entry.qa_name] ?? 0) + entry.total_hours;
        }
      }
      const sortedQADist = Object.entries(qaDistMapPDF)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const totalQADistHours = sortedQADist.reduce((s, [, h]) => s + h, 0);
      const qaDistSegments = sortedQADist.map(([qa_name, hours], i) => ({
        name: qa_name,
        hours,
        pct: totalQADistHours > 0 ? (hours / totalQADistHours) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      }));

      const activityHoursMapPDF: Record<string, number> = {};
      for (const t of filteredTimings) {
        for (const entry of t.qa_entries ?? []) {
          for (const [catId, h] of Object.entries(entry.hours_by_category)) {
            activityHoursMapPDF[catId] = (activityHoursMapPDF[catId] ?? 0) + h;
          }
        }
      }
      const nQAs = Math.max((qaMetrics ?? []).length, 1);
      const availableHoursTotal = 160 * nQAs;
      const activityRows = activeCategories
        .map((cat: CatalogTimingCategory) => ({
          name: cat.name,
          hours: activityHoursMapPDF[cat.id] ?? 0,
          color: cat.hex_color,
        }))
        .filter((r: { hours: number }) => r.hours > 0)
        .sort((a: { hours: number }, b: { hours: number }) => b.hours - a.hours)
        .map((r: { name: string; hours: number; color: string }) => ({
          ...r,
          compliance:
            availableHoursTotal > 0 ? (r.hours / availableHoursTotal) * 100 : 0,
          isOver:
            availableHoursTotal > 0 &&
            (r.hours / availableHoursTotal) * 100 > 100,
        }));
      const totalActivityHours = activityRows.reduce(
        (s: number, r: { hours: number }) => s + r.hours,
        0,
      );

      return {
        generatedAt: new Date().toLocaleString("es"),
        dateRange,
        totalTimingHours,
        totalTimingTasks,
        avgPerTask,
        avgPerQA,
        avgEfficiency,
        nActiveQAs,
        productTypeSegments,
        projectSegments,
        complexitySegments,
        productTypeSummary: productTypeSegments,
        cumulativeChartData,
        allProductTypes,
        productTypeColors,
        top5Tasks,
        qaDistSegments,
        activityRows,
        totalActivityHours,
        availableHoursTotal,
        nQAs,
      };
    }

    return {
      pdfDataManual: buildData(manualTimings, manualTasks),
      pdfDataAutomation: buildData(automationTimings, automationTasks),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    metrics,
    qaMetrics,
    manualTimings,
    manualTasks,
    automationTimings,
    automationTasks,
    timingCategories,
  ]);

  // ── PDF QA Stats data (Estadístico QA) ────────────────────────────────
  const { pdfQAStatsManual, pdfQAStatsAutomation } = useMemo<{
    pdfQAStatsManual: PDFQAStatsData | null;
    pdfQAStatsAutomation: PDFQAStatsData | null;
  }>(() => {
    if (!timingCategories || timingCategories.length === 0) {
      return { pdfQAStatsManual: null, pdfQAStatsAutomation: null };
    }

    const QA_NON_CTRL = new Set(QA_NON_CONTROLLABLE_CATEGORY_SLUGS);
    const activeCategories = timingCategories.filter(
      (c: CatalogTimingCategory) => c.is_active && !QA_NON_CTRL.has(c.slug),
    );

    const slugToId: Record<string, string> = {};
    for (const cat of timingCategories)
      slugToId[(cat as CatalogTimingCategory).slug] = (
        cat as CatalogTimingCategory
      ).id;
    const excludedCatIds = new Set(
      QA_NON_CONTROLLABLE_CATEGORY_SLUGS.map((s) => slugToId[s]).filter(
        Boolean,
      ),
    );
    const effectiveTestingCatId = slugToId["effective_testing"] ?? null;
    // Same valid-sum categories as the web dashboard
    const validSumCatIds = new Set(
      ["effective_testing", "qa_retesting", "qa_fixed"]
        .map((s) => slugToId[s])
        .filter(Boolean),
    );
    const fmtDateStr = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    };
    const dateRange = `${fmtDateStr(apiStartDate)} - ${fmtDateStr(apiEndDate)}`;

    function buildQAStatsData(
      filteredTimings: TaskTiming[],
    ): PDFQAStatsData | null {
      const map: Record<
        string,
        { hoursByCategory: Record<string, number>; totalHours: number }
      > = {};
      for (const timing of filteredTimings) {
        for (const entry of timing.qa_entries ?? []) {
          if (!map[entry.qa_name])
            map[entry.qa_name] = { hoursByCategory: {}, totalHours: 0 };
          map[entry.qa_name].totalHours += entry.total_hours;
          for (const [catId, h] of Object.entries(entry.hours_by_category)) {
            map[entry.qa_name].hoursByCategory[catId] =
              (map[entry.qa_name].hoursByCategory[catId] ?? 0) + h;
          }
        }
      }
      if (Object.keys(map).length === 0) return null;

      const rawQAs = Object.entries(map).map(([name, data]) => {
        let controllable = 0;
        let effectiveTesting = 0;
        let validHours = 0;
        for (const [catId, h] of Object.entries(data.hoursByCategory)) {
          if (!excludedCatIds.has(catId)) {
            controllable += h;
            if (effectiveTestingCatId && catId === effectiveTestingCatId)
              effectiveTesting += h;
          }
          if (validSumCatIds.has(catId)) validHours += h;
        }
        return {
          name,
          hoursByCategory: data.hoursByCategory,
          controllableHours: controllable,
          validHours,
          efficiencyRate:
            controllable > 0 ? (effectiveTesting / controllable) * 100 : 0,
        };
      });

      const activeQAs = rawQAs.filter((q) => q.controllableHours > 0);
      const nQAs = activeQAs.length;
      if (nQAs === 0) return null;

      const totalControllable = activeQAs.reduce(
        (s, q) => s + q.controllableHours,
        0,
      );
      const avgControllablePerQA = totalControllable / nQAs;
      const avgValidPerQA =
        nQAs > 0
          ? activeQAs.reduce((s, q) => s + (q.validHours ?? 0), 0) / nQAs
          : 0;
      const avgEfficiency =
        activeQAs.reduce((s, q) => s + q.efficiencyRate, 0) / nQAs;

      const totalByCat: Record<string, number> = {};
      for (const qa of rawQAs) {
        for (const cat of activeCategories) {
          const c = cat as CatalogTimingCategory;
          totalByCat[c.id] =
            (totalByCat[c.id] ?? 0) + (qa.hoursByCategory[c.id] ?? 0);
        }
      }
      const totalTeamHours = Object.values(totalByCat).reduce(
        (s, h) => s + h,
        0,
      );

      // Non-controllable hours (excluded categories)
      let nonControllableHours = 0;
      const nonControllableByCatMap: Record<string, number> = {};
      for (const qa of rawQAs) {
        for (const [catId, h] of Object.entries(qa.hoursByCategory)) {
          if (excludedCatIds.has(catId)) {
            nonControllableHours += h;
            nonControllableByCatMap[catId] =
              (nonControllableByCatMap[catId] ?? 0) + h;
          }
        }
      }
      const totalAllHours = totalTeamHours + nonControllableHours;
      const nonControllableCategories = (
        timingCategories as CatalogTimingCategory[]
      )
        .filter(
          (c) =>
            excludedCatIds.has(c.id) &&
            (nonControllableByCatMap[c.id] ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (nonControllableByCatMap[b.id] ?? 0) -
            (nonControllableByCatMap[a.id] ?? 0),
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          color: c.hex_color,
          hours: nonControllableByCatMap[c.id] ?? 0,
        }));

      const categories = [...activeCategories]
        .filter((c: CatalogTimingCategory) => (totalByCat[c.id] ?? 0) > 0)
        .sort(
          (a: CatalogTimingCategory, b: CatalogTimingCategory) =>
            (totalByCat[b.id] ?? 0) - (totalByCat[a.id] ?? 0),
        )
        .map((cat: CatalogTimingCategory) => ({
          id: cat.id,
          name: cat.name,
          color: cat.hex_color,
          teamAvgHours: (totalByCat[cat.id] ?? 0) / nQAs,
          teamTotalHours: totalByCat[cat.id] ?? 0,
          teamPct:
            totalTeamHours > 0
              ? ((totalByCat[cat.id] ?? 0) / totalTeamHours) * 100
              : 0,
        }));

      return {
        generatedAt: new Date().toLocaleString("es"),
        dateRange,
        nQAs,
        avgEfficiency,
        avgControllablePerQA,
        avgValidPerQA,
        totalTeamHours,
        nonControllableHours,
        totalAllHours,
        nonControllableCategories,
        categories,
        qas: activeQAs.sort(
          (a, b) => b.controllableHours - a.controllableHours,
        ),
      };
    }

    return {
      pdfQAStatsManual: buildQAStatsData(manualTimings),
      pdfQAStatsAutomation: buildQAStatsData(automationTimings),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualTimings, automationTimings, timingCategories]);

  const handleExportPDF = useCallback(async () => {
    if (
      !pdfDataManual &&
      !pdfDataAutomation &&
      !pdfQAStatsManual &&
      !pdfQAStatsAutomation
    )
      return;
    setExportingPDF(true);
    try {
      const [{ pdf }, { TimingAnalyticsPDFDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/TimingAnalyticsPDFDocument"),
      ]);
      const pages = [
        ...(pdfQAStatsManual
          ? [
              {
                type: "qa-stats" as const,
                data: pdfQAStatsManual,
                label: "Estadístico QA — Manual",
              },
            ]
          : []),
        ...(pdfQAStatsAutomation
          ? [
              {
                type: "qa-stats" as const,
                data: pdfQAStatsAutomation,
                label: "Estadístico QA — Automatización",
              },
            ]
          : []),
        ...(pdfDataManual
          ? [
              {
                type: "analytics" as const,
                data: pdfDataManual,
                label: "Manual",
              },
            ]
          : []),
        ...(pdfDataAutomation
          ? [
              {
                type: "analytics" as const,
                data: pdfDataAutomation,
                label: "Automatización QA",
              },
            ]
          : []),
      ];
      // @ts-expect-error — JSX element passed to pdf() at runtime
      const blob = await pdf(TimingAnalyticsPDFDocument({ pages })).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analisis-qa-tiempos-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generando PDF:", err);
    } finally {
      setExportingPDF(false);
    }
  }, [
    pdfDataManual,
    pdfDataAutomation,
    pdfQAStatsManual,
    pdfQAStatsAutomation,
  ]);

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

  // Handle editar timing — intenta fetchear datos frescos del servidor para
  // reducir la chance de abrir el form con valores stale del listado.
  // Si el GET falla o responde no-ok, abre con los datos disponibles en la
  // lista como fallback para no bloquear la edición.
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
          <div className="mb-8 flex justify-end gap-2">
            {viewMode === "metrics" && (
              <button
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar análisis a PDF"
              >
                <FileDown
                  size={18}
                  className={exportingPDF ? "animate-bounce" : ""}
                />
                {exportingPDF ? "Generando PDF..." : "Exportar PDF"}
              </button>
            )}
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
          <div>
            {/* Tab bar */}
            <div className="mb-0 flex overflow-x-auto border-b border-border">
              <button
                onClick={() => setAnalyticsTab("qa-manual")}
                className={`relative shrink-0 px-5 py-3 text-sm font-semibold transition-colors ${
                  analyticsTab === "qa-manual"
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Estadístico QA — Manual
              </button>
              <button
                onClick={() => setAnalyticsTab("qa-automation")}
                className={`relative shrink-0 px-5 py-3 text-sm font-semibold transition-colors ${
                  analyticsTab === "qa-automation"
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Estadístico QA — Automatización
              </button>
              <button
                onClick={() => setAnalyticsTab("manual")}
                className={`relative shrink-0 px-5 py-3 text-sm font-semibold transition-colors ${
                  analyticsTab === "manual"
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tiempo y Cumplimiento — Manual
              </button>
              <button
                onClick={() => setAnalyticsTab("automation")}
                className={`relative shrink-0 px-5 py-3 text-sm font-semibold transition-colors ${
                  analyticsTab === "automation"
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tiempo y Cumplimiento — Automatización
              </button>
            </div>
            {/* Tab content */}
            <div
              ref={dashboardRef}
              className="rounded-b-xl border border-t-0 border-border bg-card px-6 py-6"
            >
              {analyticsTab === "qa-manual" ||
              analyticsTab === "qa-automation" ? (
                <QAStatsDashboard
                  timings={
                    analyticsTab === "qa-manual"
                      ? manualTimings
                      : automationTimings
                  }
                  loading={loading || tasksLoading}
                />
              ) : (
                <TimingAnalyticsDashboard
                  metrics={metrics}
                  qaMetrics={qaMetrics}
                  timings={
                    analyticsTab === "manual"
                      ? manualTimings
                      : automationTimings
                  }
                  tasks={
                    analyticsTab === "manual" ? manualTasks : automationTasks
                  }
                  loading={metricsLoading}
                  qaLoading={qaMetricsLoading}
                  timingsLoading={loading || tasksLoading}
                />
              )}
            </div>
          </div>
        ) : (
          /* QA Metrics view */
          <div className="space-y-8">
            {/* Bar chart de horas por QA */}
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-6">
              <QAHoursBarChart
                qaMetrics={qaMetrics}
                loading={qaMetricsLoading}
              />
            </div>

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
