"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { QAStatsDashboard } from "@/components/QAStatsDashboard";
import { TimingAnalyticsDashboard } from "@/components/TimingAnalyticsDashboard";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { useCatalogData } from "@/hooks/useCatalogData";
import {
  Task,
  TaskTiming,
  CatalogTimingCategory,
  SquadTimingMetrics,
  QATimingMetrics,
  QAEvaluationRow,
} from "@/lib/types";
import { QA_NON_CONTROLLABLE_CATEGORY_SLUGS } from "@/lib/timingUtils";
import type {
  PDFChartData,
  PDFQAStatsData,
  PDFQAEvaluationData,
} from "@/components/TimingAnalyticsPDFDocument";

// ── Constantes idénticas a timings/page.tsx ──────────────────────────────────
const AUTOMATION_QA = "Automatización QA";
const AUTOMATION_PRODUCT = "Automation";
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

type TimingTab = "qa-manual" | "qa-automation" | "manual" | "automation";

const TAB_LABELS: { id: TimingTab; label: string }[] = [
  { id: "qa-manual", label: "Estadístico QA — Manual" },
  { id: "qa-automation", label: "Estadístico QA — Automatización" },
  { id: "manual", label: "Tiempo y Cumplimiento — Manual" },
  { id: "automation", label: "Tiempo y Cumplimiento — Automatización" },
];

export interface TimingStatsPanelHandle {
  generatePDF: () => Promise<void>;
}

const TimingStatsPanel = forwardRef<
  TimingStatsPanelHandle,
  { startDate: string; endDate: string; qaRows?: QAEvaluationRow[] }
>(function TimingStatsPanel({ startDate, endDate, qaRows = [] }, ref) {
  const { safeFetch } = useSafeAuthFetch();
  const { timingCategories } = useCatalogData();

  const [tab, setTab] = useState<TimingTab>("qa-manual");
  const [loading, setLoading] = useState(true);
  const [timings, setTimings] = useState<TaskTiming[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<SquadTimingMetrics[]>([]);
  const [qaMetrics, setQAMetrics] = useState<QATimingMetrics[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      const [tRes, tkRes, mRes, qRes] = await Promise.all([
        safeFetch(`/api/timings?${params}`, { signal: ctrl.signal }),
        safeFetch(`/api/tasks?${params}`, { signal: ctrl.signal }),
        safeFetch(`/api/timings/metrics?${params}`, { signal: ctrl.signal }),
        safeFetch(`/api/timings/metrics/qa?${params}`, { signal: ctrl.signal }),
      ]);
      if (ctrl.signal.aborted) return;
      setTimings(tRes.ok ? await tRes.json() : []);
      setTasks(tkRes.ok ? await tkRes.json() : []);
      setMetrics(mRes.ok ? await mRes.json() : []);
      setQAMetrics(qRes.ok ? await qRes.json() : []);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError")
        console.error("[TimingStatsPanel]", e);
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [startDate, endDate, safeFetch]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  // ── Manual / Automatización split ────────────────────────────────────────
  const { manualTimings, manualTasks, automationTimings, automationTasks } =
    useMemo(() => {
      const taskMap = new Map(tasks.map((t) => [t.id, t]));
      const isAuto = (task: Task | undefined) =>
        task?.project_type === AUTOMATION_QA ||
        task?.product_type === AUTOMATION_PRODUCT;
      return {
        manualTimings: timings.filter((t) => !isAuto(taskMap.get(t.task_id))),
        manualTasks: tasks.filter((t) => !isAuto(t)),
        automationTimings: timings.filter((t) =>
          isAuto(taskMap.get(t.task_id)),
        ),
        automationTasks: tasks.filter((t) => isAuto(t)),
      };
    }, [timings, tasks]);

  // ── dateRange string (formato dd/mm/yyyy) ─────────────────────────────────
  const dateRange = useMemo(() => {
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-");
      return `${d}/${m}/${y}`;
    };
    return `${fmt(startDate)} - ${fmt(endDate)}`;
  }, [startDate, endDate]);

  // ── PDF — Estadístico QA (misma lógica que timings/page.tsx) ─────────────
  const { pdfQAStatsManual, pdfQAStatsAutomation } = useMemo<{
    pdfQAStatsManual: PDFQAStatsData | null;
    pdfQAStatsAutomation: PDFQAStatsData | null;
  }>(() => {
    if (!timingCategories || timingCategories.length === 0)
      return { pdfQAStatsManual: null, pdfQAStatsAutomation: null };

    const QA_NON_CTRL = new Set(QA_NON_CONTROLLABLE_CATEGORY_SLUGS);
    const activeCategories = timingCategories.filter(
      (c: CatalogTimingCategory) => c.is_active && !QA_NON_CTRL.has(c.slug),
    );

    const slugToId: Record<string, string> = {};
    for (const cat of timingCategories) slugToId[cat.slug] = cat.id;

    const excludedCatIds = new Set(
      QA_NON_CONTROLLABLE_CATEGORY_SLUGS.map((s) => slugToId[s]).filter(
        Boolean,
      ),
    );
    const effectiveTestingCatId = slugToId["effective_testing"] ?? null;
    const validSumCatIds = new Set(
      ["effective_testing", "qa_retesting", "qa_fixed"]
        .map((s) => slugToId[s])
        .filter(Boolean),
    );

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
        activeQAs.reduce((s, q) => s + (q.validHours ?? 0), 0) / nQAs;
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
  }, [timingCategories, manualTimings, automationTimings, dateRange]);

  // ── PDF — Tiempo y Cumplimiento (misma lógica que timings/page.tsx) ───────
  const { pdfDataManual, pdfDataAutomation } = useMemo<{
    pdfDataManual: PDFChartData | null;
    pdfDataAutomation: PDFChartData | null;
  }>(() => {
    if (!metrics || metrics.length === 0)
      return { pdfDataManual: null, pdfDataAutomation: null };

    const QA_NON_CTRL = new Set(QA_NON_CONTROLLABLE_CATEGORY_SLUGS);
    const activeCategories = timingCategories.filter(
      (c: CatalogTimingCategory) => c.is_active && !QA_NON_CTRL.has(c.slug),
    );
    const slugToId: Record<string, string> = {};
    for (const cat of timingCategories) slugToId[cat.slug] = cat.id;
    const excludedCatIdsForPDF = new Set(
      QA_NON_CONTROLLABLE_CATEGORY_SLUGS.map((s) => slugToId[s]).filter(
        Boolean,
      ),
    );

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
        // Solo contar horas controlables (excluir Tiempo No Productivo)
        let hours = 0;
        for (const entry of t.qa_entries ?? []) {
          for (const [catId, h] of Object.entries(entry.hours_by_category)) {
            if (!excludedCatIdsForPDF.has(catId)) hours += h;
          }
        }
        if (hours === 0) continue;

        totalTimingHours += hours;
        timingTaskIds.add(t.task_id);
        const task = taskMap.get(t.task_id);
        if (task) {
          const pt = task.project_type ?? "Sin tipo";
          const ptype = task.product_type ?? "Sin producto";
          productHoursMap[pt] = (productHoursMap[pt] ?? 0) + hours;
          productTypeHoursMap[ptype] =
            (productTypeHoursMap[ptype] ?? 0) + hours;
          if (task.tshirt_size)
            complexityHoursMap[task.tshirt_size] =
              (complexityHoursMap[task.tshirt_size] ?? 0) + hours;
          const dateKey = (t.created_at ?? "").split("T")[0];
          if (dateKey) {
            if (!dailyProductTypeMap[dateKey])
              dailyProductTypeMap[dateKey] = {};
            dailyProductTypeMap[dateKey][ptype] =
              (dailyProductTypeMap[dateKey][ptype] ?? 0) + hours;
          }
        }
      }

      const totalTimingTasks = timingTaskIds.size;
      const avgPerTask =
        totalTimingTasks > 0 ? totalTimingHours / totalTimingTasks : 0;
      const nActiveQAs = qaMetrics.filter((q) => q.total_hours > 0).length;
      const totalQAHours = qaMetrics.reduce((s, q) => s + q.total_hours, 0);
      const avgPerQA = nActiveQAs > 0 ? totalQAHours / nActiveQAs : 0;
      const avgEfficiency =
        qaMetrics.length > 0
          ? qaMetrics.reduce((s, q) => s + (q.efficiency_rate ?? 0), 0) /
            qaMetrics.length
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
        label: qa_name,
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
      const nQAs = Math.max(qaMetrics.length, 1);
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
  }, [
    metrics,
    qaMetrics,
    manualTimings,
    manualTasks,
    automationTimings,
    automationTasks,
    timingCategories,
    dateRange,
  ]);

  // ── Exponer generatePDF al padre ─────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      generatePDF: async () => {
        try {
          const [{ pdf }, { TimingAnalyticsPDFDocument }] = await Promise.all([
            import("@react-pdf/renderer"),
            import("@/components/TimingAnalyticsPDFDocument"),
          ]);

          // Página 1: tabla de evaluaciones QA (si hay filas)
          const qaEvalData: PDFQAEvaluationData | null =
            qaRows.length > 0
              ? {
                  rows: qaRows.map((r) => ({
                    qa_name: r.qa_name,
                    tasa_aceptacion: r.tasa_aceptacion,
                    cumplimiento: r.cumplimiento,
                    excelencia: r.excelencia,
                    soft_skills: r.soft_skills,
                    comentarios: r.comentarios,
                  })),
                  startDate,
                  endDate,
                  generatedAt: new Date().toLocaleString("es"),
                }
              : null;

          const pages = [
            ...(qaEvalData
              ? [{ type: "qa-evaluation" as const, data: qaEvalData }]
              : []),
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
          if (pages.length === 0) return;
          const blob = await pdf(
            TimingAnalyticsPDFDocument({ pages }),
          ).toBlob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `analisis-qa-tiempos-${new Date().toISOString().slice(0, 10)}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error("[TimingStatsPanel] Error generando PDF:", err);
        }
      },
    }),
    [
      qaRows,
      startDate,
      endDate,
      pdfQAStatsManual,
      pdfQAStatsAutomation,
      pdfDataManual,
      pdfDataAutomation,
    ],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Análisis de Tiempos
      </p>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative shrink-0 px-5 py-3 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-b-xl border border-t-0 border-border bg-card px-6 py-6">
        {tab === "qa-manual" || tab === "qa-automation" ? (
          <QAStatsDashboard
            timings={tab === "qa-manual" ? manualTimings : automationTimings}
            loading={loading}
          />
        ) : (
          <TimingAnalyticsDashboard
            metrics={metrics}
            qaMetrics={qaMetrics}
            timings={tab === "manual" ? manualTimings : automationTimings}
            tasks={tab === "manual" ? manualTasks : automationTasks}
            loading={false}
            qaLoading={loading}
            timingsLoading={loading}
          />
        )}
      </div>
    </div>
  );
});

TimingStatsPanel.displayName = "TimingStatsPanel";
export default TimingStatsPanel;
