"use client";

/**
 * TimingAnalyticsDashboard
 *
 * Nuevo dashboard de métricas para la pestaña "Métricas" en Gestión de Tiempos.
 * Inspirado en el diseño "Análisis de Tiempo y Cumplimiento" de Stitch.
 * Adaptado al sistema de colores / clases del proyecto (dark + light mode).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  SquadTimingMetrics,
  QATimingMetrics,
  TaskTiming,
  Task,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import {
  formatTime,
  QA_NON_CONTROLLABLE_CATEGORY_SLUGS,
} from "@/lib/timingUtils";

const QA_NON_CONTROLLABLE_SLUG_SET = new Set<string>(
  QA_NON_CONTROLLABLE_CATEGORY_SLUGS,
);
const isCategoryVisibleForQA = (cat: { is_active: boolean; slug: string }) =>
  cat.is_active && !QA_NON_CONTROLLABLE_SLUG_SET.has(cat.slug);

// Defer chart render until container has a positive measured width (avoids Recharts width=-1)
// Double rAF ensures CSS layout has fully settled before measuring.
function ChartWrapper({
  height,
  children,
}: {
  height: number | string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let ro: ResizeObserver | undefined;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.getBoundingClientRect().width;
        if (w > 0) {
          setReady(true);
          return;
        }
        ro = new ResizeObserver((entries) => {
          if ((entries[0]?.contentRect.width ?? 0) > 0) setReady(true);
        });
        ro.observe(el);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);
  return (
    <div ref={ref} style={{ height }}>
      {ready ? children : null}
    </div>
  );
}

// Paleta de colores coherente con el branding de la plataforma
const PALETTE = [
  { solid: "#F59E0B", light: "#FEF3C7", dark: "#D97706" }, // amber
  { solid: "#3B82F6", light: "#DBEAFE", dark: "#2563EB" }, // blue
  { solid: "#8B5CF6", light: "#EDE9FE", dark: "#7C3AED" }, // violet
  { solid: "#EC4899", light: "#FCE7F3", dark: "#DB2777" }, // pink
  { solid: "#10B981", light: "#D1FAE5", dark: "#059669" }, // emerald
  { solid: "#EF4444", light: "#FEE2E2", dark: "#DC2626" }, // red
];

// ─────────────────────────────────────────
// Sub-componentes de UI
// ─────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
}

function KPICard({
  label,
  value,
  subtitle,
  icon,
  accentColor,
  accentBg,
}: KPICardProps) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-5">
      <div
        className="shrink-0 rounded-full p-2"
        style={{ backgroundColor: accentBg }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>
      <div>
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: accentColor }}
        >
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// Barra horizontal con etiqueta y porcentaje
function HBarRow({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold text-foreground">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// Tooltip para textos truncados
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-block max-w-full">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-normal text-popover-foreground shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

// Anillo SVG simulado (donut) con tooltip al hover
function DonutRing({
  segments,
  size = 128,
  stroke = 18,
}: {
  segments: { pct: number; color: string; label?: string; value?: string }[];
  size?: number;
  stroke?: number;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        {segments.map((seg, i) => {
          const dashLen = (seg.pct / 100) * circ;
          const dashGap = circ - dashLen;
          const rotate = (offset / 100) * 360 - 90;
          offset += seg.pct;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={hovered === i ? stroke + 4 : stroke}
              strokeDasharray={`${dashLen} ${dashGap}`}
              style={{
                transformOrigin: "center",
                transform: `rotate(${rotate}deg)`,
                transition: "stroke-width 0.15s ease",
                cursor: seg.label ? "pointer" : "default",
              }}
              onMouseEnter={() => seg.label && setHovered(i)}
            />
          );
        })}
      </svg>
      {hovered !== null && segments[hovered]?.label && (
        <div
          className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg"
          style={{ left: pos.x, top: pos.y - 8 }}
        >
          <span className="font-semibold">{segments[hovered].label}</span>
          {segments[hovered].value && (
            <span className="ml-1.5 text-muted-foreground">
              {segments[hovered].value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Panel con borde, título e icono info
function Panel({
  title,
  children,
  infoNote,
}: {
  title: string;
  children: React.ReactNode;
  infoNote?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">
        {title}
      </h3>
      <div className="flex-1">{children}</div>
      {infoNote && (
        <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8h.01M12 12v4" />
          </svg>
          <p>{infoNote}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────

interface TimingAnalyticsDashboardProps {
  metrics: SquadTimingMetrics[];
  qaMetrics: QATimingMetrics[];
  timings?: TaskTiming[];
  tasks?: Task[];
  loading?: boolean;
  qaLoading?: boolean;
  timingsLoading?: boolean;
}

export function TimingAnalyticsDashboard({
  metrics,
  qaMetrics,
  timings = [],
  tasks = [],
  loading = false,
  qaLoading = false,
  timingsLoading = false,
}: TimingAnalyticsDashboardProps) {
  const {
    timingCategories,
    complexities,
    loading: catalogLoading,
  } = useCatalogData();
  const activeCategories = timingCategories.filter(isCategoryVisibleForQA);

  const isLoading = loading || catalogLoading;

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">Cargando métricas...</p>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          No hay datos disponibles para el período seleccionado.
        </p>
      </div>
    );
  }

  // ── Cálculos globales ──────────────────────────────────────────────────
  // totalHours / totalTasks se calculan DESPUÉS del loop para que sean
  // coherentes con totalTimingHours y los donuts (misma fuente de datos).
  // Se usan como fallback si el loop aún no corrió (sin timings).
  const totalHours = metrics.reduce((s, m) => s + m.total_hours, 0);
  const totalTasks = metrics.reduce((s, m) => s + m.task_count, 0);

  // ── Promedio por QA y Eficiencia — derivados de timings.qa_entries ─────
  // Se calculan desde los timings ya filtrados (sub-pestaña) para que los
  // KPIs reflejen exclusivamente el subconjunto visible. qaMetrics es global
  // y NO se puede usar para estos KPIs sin distorsionar los valores.
  const slugToId: Record<string, string> = {};
  for (const cat of timingCategories) {
    slugToId[cat.slug] = cat.id;
  }
  const excludedCatIds = new Set(
    QA_NON_CONTROLLABLE_CATEGORY_SLUGS.map((slug) => slugToId[slug]).filter(
      Boolean,
    ),
  );
  const effectiveTestingCatId = slugToId["effective_testing"] ?? null;

  const qaHoursMap: Record<
    string,
    { controllable: number; effectiveTesting: number }
  > = {};
  for (const timing of timings) {
    for (const entry of timing.qa_entries ?? []) {
      if (!qaHoursMap[entry.qa_name]) {
        qaHoursMap[entry.qa_name] = { controllable: 0, effectiveTesting: 0 };
      }
      for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
        if (!excludedCatIds.has(catId)) {
          qaHoursMap[entry.qa_name].controllable += hours;
          if (effectiveTestingCatId && catId === effectiveTestingCatId) {
            qaHoursMap[entry.qa_name].effectiveTesting += hours;
          }
        }
      }
    }
  }
  const qaHoursEntries = Object.entries(qaHoursMap).filter(
    ([, v]) => v.controllable > 0,
  );
  const nActiveQAs = qaHoursEntries.length;
  const totalControllableQAHours = qaHoursEntries.reduce(
    (s, [, v]) => s + v.controllable,
    0,
  );
  const avgPerQA = nActiveQAs > 0 ? totalControllableQAHours / nActiveQAs : 0;
  const avgEfficiency =
    nActiveQAs > 0
      ? qaHoursEntries.reduce(
          (s, [, v]) =>
            s +
            (v.controllable > 0
              ? (v.effectiveTesting / v.controllable) * 100
              : 0),
          0,
        ) / nActiveQAs
      : 0;

  // ── Distribución por producto Y complejidad — mismo loop, mismo total ──
  // Ambos donuts comparten la misma base de datos (timings + tasks) para
  // garantizar que sus totales sean equivalentes entre sí.
  const sizeOrder = complexities
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((c) => c.name);

  const productHoursMap: Record<string, number> = {};
  const productTasksMap: Record<string, Set<string>> = {};
  const complexityHoursMap: Record<string, number> = {};
  // productTypeHoursMap: agrupación por product_type (Apps/Brain/Automation/Marketplace)
  // para el gráfico de líneas y la tabla resumen
  const productTypeHoursMap: Record<string, number> = {};
  const dailyProductTypeMap: Record<string, Record<string, number>> = {};
  // totalTimingHours = TODAS las horas del rango, independientemente de si la
  // tarea tiene project_type o tshirt_size asignado. Es el denominador único
  // que garantiza coherencia entre ambos donuts, las barras y los KPIs.
  let totalTimingHours = 0;

  if (timings.length > 0 && tasks.length > 0) {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    for (const timing of timings) {
      const task = taskMap.get(timing.task_id);
      if (!task) continue;
      const hours = timing.total_hours ?? 0;

      // Suma al total real siempre que la tarea exista
      totalTimingHours += hours;

      // Agrupar por tipo de proyecto (Feature, Bug, Epic, etc.)
      if (task.project_type) {
        productHoursMap[task.project_type] =
          (productHoursMap[task.project_type] ?? 0) + hours;
        if (!productTasksMap[task.project_type])
          productTasksMap[task.project_type] = new Set();
        productTasksMap[task.project_type].add(task.id);
      }

      if (task.tshirt_size) {
        complexityHoursMap[task.tshirt_size] =
          (complexityHoursMap[task.tshirt_size] ?? 0) + hours;
      }

      // Acumulación diaria por product_type para el gráfico de líneas
      if (task.product_type && hours > 0) {
        productTypeHoursMap[task.product_type] =
          (productTypeHoursMap[task.product_type] ?? 0) + hours;
        const dateKey = timing.created_at.split("T")[0];
        if (!dailyProductTypeMap[dateKey]) dailyProductTypeMap[dateKey] = {};
        dailyProductTypeMap[dateKey][task.product_type] =
          (dailyProductTypeMap[dateKey][task.product_type] ?? 0) + hours;
      }
    }
  }

  // ── Gráfico de líneas acumulado por product_type ────────────────────────
  const allProductTypes = Object.keys(productTypeHoursMap).sort(
    (a, b) => productTypeHoursMap[b] - productTypeHoursMap[a],
  );
  const productTypeColors: Record<string, string> = {};
  allProductTypes.forEach((p, i) => {
    productTypeColors[p] = PALETTE[i % PALETTE.length].solid;
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
        (dailyProductTypeMap[date][product] ?? 0);
      entry[product] = Math.round(cumulativeTracker[product] * 100) / 100;
    }
    return entry;
  });

  // Tabla resumen por product_type
  const productTypeSummary = allProductTypes.map((p, i) => ({
    label: p,
    hours: productTypeHoursMap[p],
    pct:
      totalTimingHours > 0
        ? (productTypeHoursMap[p] / totalTimingHours) * 100
        : 0,
    color: PALETTE[i % PALETTE.length].solid,
  }));

  // ── Top 5 tareas por horas ─────────────────────────────────────────────
  const top5Tasks = [...timings]
    .sort((a, b) => (b.total_hours ?? 0) - (a.total_hours ?? 0))
    .slice(0, 5)
    .map((t) => {
      const task = tasks.find((tk) => tk.id === t.task_id);
      return { name: task?.name ?? t.task_id, hours: t.total_hours ?? 0 };
    });
  const maxTop5Hours = top5Tasks[0]?.hours ?? 1;

  // ── Distribución de tiempo por QA (desde qa_entries de timings filtrados) ─
  const qaDistMap: Record<string, number> = {};
  for (const timing of timings) {
    for (const entry of timing.qa_entries ?? []) {
      qaDistMap[entry.qa_name] =
        (qaDistMap[entry.qa_name] ?? 0) + entry.total_hours;
    }
  }
  const sortedQADistEntries = Object.entries(qaDistMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const totalQADistHours = sortedQADistEntries.reduce((s, [, h]) => s + h, 0);
  const qaDistSegments = sortedQADistEntries.map(([qa_name, hours], i) => ({
    name: qa_name,
    hours,
    pct: totalQADistHours > 0 ? (hours / totalQADistHours) * 100 : 0,
    color: PALETTE[i % PALETTE.length].solid,
  }));

  // ── Cumplimiento por tipo de actividad (desde qa_entries de timings filtrados) ─
  // Cumplimiento = horas reales / (160h × nQAs) × 100
  const activityHoursMap: Record<string, number> = {};
  for (const timing of timings) {
    for (const entry of timing.qa_entries ?? []) {
      for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
        activityHoursMap[catId] = (activityHoursMap[catId] ?? 0) + hours;
      }
    }
  }
  const nQAs = Math.max(qaMetrics.length, 1);
  const availableHoursTotal = 160 * nQAs;
  const activityRows = activeCategories
    .map((cat) => ({
      name: cat.name,
      color: cat.hex_color,
      hours: activityHoursMap[cat.id] ?? 0,
    }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const totalActivityHours = activityRows.reduce((s, r) => s + r.hours, 0);

  // Colores fijos por talla para consistencia visual
  const COMPLEXITY_COLORS: Record<string, string> = {
    XS: "#10B981",
    S: "#3B82F6",
    M: "#8B5CF6",
    L: "#F59E0B",
    XL: "#EC4899",
    XXL: "#EF4444",
  };

  const complexitySegments = sizeOrder
    .filter((size) => (complexityHoursMap[size] ?? 0) > 0)
    .map((size) => {
      const hours = complexityHoursMap[size] ?? 0;
      const pct = totalTimingHours > 0 ? (hours / totalTimingHours) * 100 : 0;
      const color = COMPLEXITY_COLORS[size] ?? "#6B7280";
      return { size, hours, pct, color };
    })
    .sort((a, b) => b.hours - a.hours);

  const topComplexity = complexitySegments[0];

  // Tareas únicas con timing en el período (para la KPI card "Total tareas")
  const timingTaskIds = new Set(timings.map((t) => t.task_id));
  const totalTimingTasks = timingTaskIds.size;
  // Promedio por tarea basado en la misma fuente que los donuts
  const avgPerTask =
    totalTimingTasks > 0 ? totalTimingHours / totalTimingTasks : 0;

  // Segments de producto ordenados por horas desc
  const productSegments = Object.entries(productHoursMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, hours], i) => ({
      label,
      hours,
      tasks: productTasksMap[label]?.size ?? 0,
      pct: totalTimingHours > 0 ? (hours / totalTimingHours) * 100 : 0,
      color: PALETTE[i % PALETTE.length].solid,
      light: PALETTE[i % PALETTE.length].light,
    }));

  // ── Distribución por categoría (top categorías por horas totales) ───────
  const categoryTotals: {
    id: string;
    name: string;
    hexColor: string;
    total: number;
  }[] = [];
  for (const cat of activeCategories) {
    const total = metrics.reduce(
      (s, m) => s + (m.totals_by_category?.[cat.id] ?? 0),
      0,
    );
    if (total > 0) {
      categoryTotals.push({
        id: cat.id,
        name: cat.name,
        hexColor: cat.hex_color,
        total,
      });
    }
  }
  categoryTotals.sort((a, b) => b.total - a.total);
  const _totalCatHours = categoryTotals.reduce((s, c) => s + c.total, 0);

  // ── Top 5 por horas (productos) ────────────────────────────────────────
  const top5Products = [...metrics]
    .sort((a, b) => b.total_hours - a.total_hours)
    .slice(0, 5);
  const _maxProductHours = top5Products[0]?.total_hours ?? 0;

  return (
    <div className="space-y-6">
      {/* ── FILA 1: KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KPICard
          label="Tiempo total invertido"
          value={
            timingsLoading ? "..." : formatTime(totalTimingHours || totalHours)
          }
          subtitle="100% del tiempo registrado"
          accentColor={PALETTE[0].solid}
          accentBg={PALETTE[0].light}
          icon={
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm.5 5v5.69l3.9 2.25-.75 1.3L11.5 13.5V7z" />
            </svg>
          }
        />
        <KPICard
          label="Total tareas analizadas"
          value={timingsLoading ? "..." : totalTimingTasks || totalTasks}
          subtitle="Con tiempo registrado"
          accentColor={PALETTE[1].solid}
          accentBg={PALETTE[1].light}
          icon={
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
            </svg>
          }
        />
        <KPICard
          label="Promedio por tarea"
          value={timingsLoading ? "..." : formatTime(avgPerTask)}
          subtitle="Horas promedio / tarea"
          accentColor={PALETTE[2].solid}
          accentBg={PALETTE[2].light}
          icon={
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          }
        />
        <KPICard
          label="Promedio por QA"
          value={qaLoading ? "..." : formatTime(avgPerQA)}
          subtitle={`${nActiveQAs} QA${nActiveQAs !== 1 ? "s" : ""} activo${nActiveQAs !== 1 ? "s" : ""}`}
          accentColor={PALETTE[3].solid}
          accentBg={PALETTE[3].light}
          icon={
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          }
        />
        <KPICard
          label="Eficiencia QA"
          value={qaLoading ? "..." : `${avgEfficiency.toFixed(1)}%`}
          subtitle="Testing efectivo · 160h disponibles/QA"
          accentColor={
            avgEfficiency > 70
              ? PALETTE[4].solid
              : avgEfficiency > 50
                ? PALETTE[0].solid
                : PALETTE[5].solid
          }
          accentBg={
            avgEfficiency > 70
              ? PALETTE[4].light
              : avgEfficiency > 50
                ? PALETTE[0].light
                : PALETTE[5].light
          }
          icon={
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="m16 6-2.22 2.22L15.17 9.6 13 12l-2.17-2.4L8.78 11.8 4 6.4V18h16V6.4z" />
            </svg>
          }
        />
      </div>

      {/* ── FILA 2: Distribución por Producto · Categorías · QA ────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Donut — distribución por producto */}
        <Panel
          title="Distribución de tiempo por producto"
          infoNote={
            productSegments.length > 0
              ? `${productSegments[0].label} concentra el mayor tiempo con ${productSegments[0].pct.toFixed(1)}% del total.`
              : undefined
          }
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <DonutRing
                segments={productSegments.map((s) => ({
                  pct: s.pct,
                  color: s.color,
                  label: s.label,
                  value: `${s.pct.toFixed(1)}% · ${formatTime(s.hours)}`,
                }))}
                size={144}
                stroke={20}
              />
              <div className="absolute text-center">
                <span className="block text-xl font-bold text-foreground">
                  {formatTime(totalTimingHours)}
                </span>
                <span className="text-xs text-muted-foreground">TOTAL</span>
              </div>
            </div>
            <div className="w-full space-y-2">
              {productSegments.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-foreground">{s.label}</span>
                  </div>
                  <span className="font-bold" style={{ color: s.color }}>
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Barras — tiempo por tipo de proyecto */}
        <Panel
          title="Tiempo por tipo de proyecto"
          infoNote={
            productSegments.length > 0
              ? `${productSegments[0].label} lidera con ${productSegments[0].pct.toFixed(1)}% del tiempo total registrado.`
              : undefined
          }
        >
          <div className="space-y-3">
            {productSegments
              .filter((s) => s.hours > 0)
              .map((s) => (
                <HBarRow
                  key={s.label}
                  label={`${s.label} · ${formatTime(s.hours)}`}
                  pct={s.pct}
                  color={s.color}
                />
              ))}
            {productSegments.filter((s) => s.hours > 0).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin datos de tipos de proyecto.
              </p>
            )}
          </div>
        </Panel>

        {/* Distribución por complejidad */}
        <Panel
          title="Distribución de tiempo por complejidad"
          infoNote={
            !timingsLoading && topComplexity
              ? `Las tareas de talla ${topComplexity.size} concentran el mayor tiempo (${topComplexity.pct.toFixed(1)}%).`
              : undefined
          }
        >
          {timingsLoading ? (
            <p className="text-sm text-muted-foreground">Cargando datos...</p>
          ) : complexitySegments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin datos de complejidad disponibles.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative flex items-center justify-center">
                <DonutRing
                  segments={complexitySegments.map((s) => ({
                    pct: s.pct,
                    color: s.color,
                    label: s.size,
                    value: `${s.pct.toFixed(1)}% · ${formatTime(s.hours)}`,
                  }))}
                  size={128}
                  stroke={18}
                />
                <div className="absolute text-center">
                  <span className="block text-base font-bold text-foreground">
                    {formatTime(totalTimingHours)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    TOTAL
                  </span>
                </div>
              </div>
              <div className="w-full space-y-2">
                {complexitySegments.map((s) => (
                  <div
                    key={s.size}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-foreground font-medium">
                        {s.size}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(s.hours)}
                      </span>
                    </div>
                    <span
                      className="font-bold text-xs"
                      style={{ color: s.color }}
                    >
                      {s.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── FILA 3: Gráfico de líneas acumulado + Tabla resumen ─────── */}
      {!timingsLoading && cumulativeChartData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          {/* Gráfico de líneas */}
          <Panel
            title="Tiempo acumulado por producto"
            infoNote="Evolución del tiempo registrado acumulado por tipo de producto a lo largo del período."
          >
            <ChartWrapper height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={cumulativeChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => {
                      try {
                        return format(parseISO(v), "dd MMM", { locale: es });
                      } catch {
                        return v;
                      }
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => {
                      if (v === 0) return "0";
                      const days = Math.floor(v / 8);
                      return days > 0 ? `${days}d` : `${Math.round(v)}h`;
                    }}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: 12,
                      color: "var(--foreground)",
                    }}
                    labelFormatter={(v) => {
                      try {
                        return format(
                          parseISO(v as string),
                          "dd 'de' MMMM yyyy",
                          { locale: es },
                        );
                      } catch {
                        return v as string;
                      }
                    }}
                    formatter={(value: number, name: string) => [
                      formatTime(value),
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value) => (
                      <span style={{ color: productTypeColors[value] }}>
                        {value}
                      </span>
                    )}
                  />
                  {allProductTypes.map((p) => (
                    <Line
                      key={p}
                      type="monotone"
                      dataKey={p}
                      stroke={productTypeColors[p]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartWrapper>
          </Panel>

          {/* Tabla resumen */}
          <Panel title="Tiempo por producto (resumen)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-semibold">Producto</th>
                    <th className="pb-2 text-right font-semibold">Tiempo</th>
                    <th className="pb-2 text-right font-semibold">
                      % del total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productTypeSummary.map((row) => (
                    <tr
                      key={row.label}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="text-foreground">{row.label}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-foreground">
                        {formatTime(row.hours)}
                      </td>
                      <td
                        className="py-2.5 text-right font-bold"
                        style={{ color: row.color }}
                      >
                        {row.pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-bold">
                    <td className="py-2.5 pl-1 text-foreground">TOTAL</td>
                    <td className="py-2.5 text-right text-foreground">
                      {formatTime(totalTimingHours)}
                    </td>
                    <td className="py-2.5 text-right text-foreground">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ── FILA 4: Top 5 tareas · Distribución QA · Cumplimiento ──────── */}
      {!timingsLoading &&
        (top5Tasks.length > 0 ||
          qaDistSegments.length > 0 ||
          activityRows.length > 0) && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Top 5 tareas */}
            <Panel
              title="Top 5 tareas con más tiempo invertido"
              infoNote="Ordenadas de mayor a menor horas registradas en el período."
            >
              {top5Tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin datos de tareas.
                </p>
              ) : (
                <div className="space-y-4">
                  {top5Tasks.map((t, i) => {
                    const c = PALETTE[i % PALETTE.length];
                    const pct =
                      maxTop5Hours > 0 ? (t.hours / maxTop5Hours) * 100 : 0;
                    return (
                      <div key={t.name + i} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-foreground">
                          <Tip text={t.name}>
                            <span className="inline-block truncate max-w-[180px] align-bottom">
                              {t.name}
                            </span>
                          </Tip>
                          <span style={{ color: c.solid }}>
                            {formatTime(t.hours)}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: c.solid,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {/* Distribución de tiempo por QA */}
            <Panel
              title="Tiempo por QA (distribución)"
              infoNote={
                qaDistSegments.length > 0
                  ? `${qaDistSegments[0].name} lidera con ${qaDistSegments[0].pct.toFixed(1)}% del tiempo total.`
                  : undefined
              }
            >
              {qaDistSegments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin datos de QA.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative flex items-center justify-center">
                    <DonutRing
                      segments={qaDistSegments.map((s) => ({
                        pct: s.pct,
                        color: s.color,
                        label: s.name,
                        value: `${s.pct.toFixed(1)}% · ${formatTime(s.hours)}`,
                      }))}
                      size={140}
                      stroke={20}
                    />
                    <div className="absolute text-center">
                      <span className="block text-base font-bold text-foreground leading-tight">
                        {formatTime(
                          qaDistSegments.reduce((acc, s) => acc + s.hours, 0),
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        TOTAL
                      </span>
                    </div>
                  </div>
                  <div className="w-full space-y-2">
                    {qaDistSegments.map((s) => (
                      <div
                        key={s.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <Tip text={s.name}>
                            <span className="inline-block truncate max-w-[130px] align-bottom text-foreground">
                              {s.name}
                            </span>
                          </Tip>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-muted-foreground">
                            {formatTime(s.hours)}
                          </span>
                          <span
                            className="font-bold w-12 text-right"
                            style={{ color: s.color }}
                          >
                            {s.pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            {/* Cumplimiento por tipo de actividad */}
            <Panel
              title="Cumplimiento por tipo de actividad"
              infoNote={`Basado en ${availableHoursTotal}h disponibles (160h × ${nQAs} QA${nQAs !== 1 ? "s" : ""}).`}
            >
              {activityRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin datos de actividades.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-semibold">
                          Actividad
                        </th>
                        <th className="pb-2 text-right font-semibold">
                          Tiempo
                        </th>
                        <th className="pb-2 text-right font-semibold">
                          Cumpl.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activityRows.map((row) => {
                        const compliance =
                          availableHoursTotal > 0
                            ? (row.hours / availableHoursTotal) * 100
                            : 0;
                        const isOver = compliance > 100;
                        return (
                          <tr
                            key={row.name}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                  style={{ backgroundColor: row.color }}
                                />
                                <Tip text={row.name}>
                                  <span className="inline-block truncate max-w-[120px] align-bottom text-foreground">
                                    {row.name}
                                  </span>
                                </Tip>
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-foreground">
                              {formatTime(row.hours)}
                            </td>
                            <td
                              className="py-2.5 text-right font-bold"
                              style={{
                                color: isOver
                                  ? "#EF4444"
                                  : compliance > 70
                                    ? "#10B981"
                                    : "#F59E0B",
                              }}
                            >
                              {compliance.toFixed(1)}%{isOver ? "*" : ""}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-muted/40 font-bold">
                        <td className="py-2.5 pl-1 text-foreground">
                          TOTAL VÁLIDO
                        </td>
                        <td className="py-2.5 text-right text-foreground">
                          {formatTime(totalActivityHours)}
                        </td>
                        <td
                          className="py-2.5 text-right font-bold"
                          style={{
                            color:
                              availableHoursTotal > 0 &&
                              (totalActivityHours / availableHoursTotal) * 100 >
                                100
                                ? "#EF4444"
                                : "#10B981",
                          }}
                        >
                          {availableHoursTotal > 0
                            ? `${((totalActivityHours / availableHoursTotal) * 100).toFixed(1)}%`
                            : "—"}
                          {availableHoursTotal > 0 &&
                          (totalActivityHours / availableHoursTotal) * 100 > 100
                            ? "*"
                            : ""}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}

      {/* ── Nota de pie ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <svg
          className="h-4 w-4 shrink-0 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8h.01M12 12v4" />
        </svg>
        <p>
          Los tiempos están calculados en base a las horas registradas por cada
          QA en las tareas del período seleccionado. Las categorías no
          controlables por el equipo QA se excluyen de las métricas de
          eficiencia.
        </p>
      </div>
    </div>
  );
}
