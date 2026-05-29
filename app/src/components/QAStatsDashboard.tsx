"use client";

/**
 * QAStatsDashboard
 *
 * Dashboard de Análisis Estadístico QA derivado de qa_entries de los timings filtrados.
 * Muestra métricas por QA: promedios por área, distribución, comparativo, ranking eficiencia
 * y composición porcentual. Separado en variante Manual y Automatización según el sub-tab.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TaskTiming } from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import {
  formatTime,
  QA_NON_CONTROLLABLE_CATEGORY_SLUGS,
} from "@/lib/timingUtils";

const QA_NON_CTRL_SET = new Set<string>(QA_NON_CONTROLLABLE_CATEGORY_SLUGS);

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

// ── Sub-components ─────────────────────────────────────────────────────────

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DonutSVG({
  segments,
  size,
  stroke,
  onSegmentHover,
}: {
  segments: { pct: number; color: string; label: string; hours: number }[];
  size: number;
  stroke: number;
  onSegmentHover?: (idx: number | null) => void;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ cursor: onSegmentHover ? "pointer" : undefined }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--border, #3F3F46)"
        strokeWidth={stroke}
      />
      {segments
        .filter((s) => s.pct > 0.3)
        .map((seg, i) => {
          const dashLen = Math.max((seg.pct / 100) * circ, 0.01);
          const dashGap = Math.max(circ - dashLen, 0.01);
          const rotate = (offset / 100) * 360 - 90;
          offset += seg.pct;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke + 4}
              strokeDasharray={`${dashLen} ${dashGap}`}
              transform={`rotate(${rotate}, ${cx}, ${cy})`}
              opacity={0}
              onMouseEnter={() => onSegmentHover?.(i)}
              onMouseLeave={() => onSegmentHover?.(null)}
            />
          );
        })}
      {/* Visible arcs rendered on top */}
      {(() => {
        let visOffset = 0;
        return segments
          .filter((s) => s.pct > 0.3)
          .map((seg, i) => {
            const dashLen = Math.max((seg.pct / 100) * circ, 0.01);
            const dashGap = Math.max(circ - dashLen, 0.01);
            const rotate = (visOffset / 100) * 360 - 90;
            visOffset += seg.pct;
            return (
              <circle
                key={`vis-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${dashLen} ${dashGap}`}
                transform={`rotate(${rotate}, ${cx}, ${cy})`}
                style={{ pointerEvents: "none" }}
              />
            );
          });
      })()}
    </svg>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QAStatsDashboard({
  timings,
  loading = false,
}: {
  timings: TaskTiming[];
  loading?: boolean;
}) {
  const { timingCategories, loading: catalogLoading } = useCatalogData();

  const activeCategories = useMemo(
    () =>
      timingCategories.filter(
        (c) => c.is_active && !QA_NON_CTRL_SET.has(c.slug),
      ),
    [timingCategories],
  );

  const { excludedCatIds, effectiveTestingCatId, validSumCatIds } =
    useMemo(() => {
      const slugToId: Record<string, string> = {};
      for (const cat of timingCategories) slugToId[cat.slug] = cat.id;
      const excludedCatIds = new Set(
        QA_NON_CONTROLLABLE_CATEGORY_SLUGS.map((s) => slugToId[s]).filter(
          Boolean,
        ),
      );
      const effectiveTestingCatId = slugToId["effective_testing"] ?? null;
      // Solo las 3 categorías válidas para el total de horas promedio
      const validSumCatIds = new Set(
        ["effective_testing", "qa_retesting", "qa_fixed"]
          .map((s) => slugToId[s])
          .filter(Boolean),
      );
      return { excludedCatIds, effectiveTestingCatId, validSumCatIds };
    }, [timingCategories]);

  // Per-QA aggregation from qa_entries
  const qaData = useMemo(() => {
    const map: Record<
      string,
      { hoursByCategory: Record<string, number>; totalHours: number }
    > = {};
    for (const timing of timings) {
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
    return Object.entries(map)
      .map(([name, data]) => {
        let controllable = 0;
        let effectiveTesting = 0;
        for (const [catId, h] of Object.entries(data.hoursByCategory)) {
          if (!excludedCatIds.has(catId)) {
            controllable += h;
            if (effectiveTestingCatId && catId === effectiveTestingCatId)
              effectiveTesting += h;
          }
        }
        return {
          name,
          hoursByCategory: data.hoursByCategory,
          totalHours: data.totalHours,
          controllableHours: controllable,
          validHours: Object.entries(data.hoursByCategory).reduce(
            (s, [catId, h]) => s + (validSumCatIds.has(catId) ? h : 0),
            0,
          ),
          effectiveTesting,
          efficiencyRate:
            controllable > 0 ? (effectiveTesting / controllable) * 100 : 0,
        };
      })
      .sort((a, b) => b.controllableHours - a.controllableHours);
  }, [timings, excludedCatIds, effectiveTestingCatId, validSumCatIds]);

  const activeQAs = useMemo(
    () => qaData.filter((q) => q.controllableHours > 0),
    [qaData],
  );
  const nQAs = activeQAs.length;

  const totalControllable = useMemo(
    () => activeQAs.reduce((s, q) => s + q.controllableHours, 0),
    [activeQAs],
  );
  const _avgPerQA = nQAs > 0 ? totalControllable / nQAs : 0;
  const avgValidPerQA =
    nQAs > 0 ? activeQAs.reduce((s, q) => s + q.validHours, 0) / nQAs : 0;
  const avgEfficiency =
    nQAs > 0 ? activeQAs.reduce((s, q) => s + q.efficiencyRate, 0) / nQAs : 0;

  const totalByCat = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const qa of qaData) {
      for (const cat of activeCategories) {
        totals[cat.id] =
          (totals[cat.id] ?? 0) + (qa.hoursByCategory[cat.id] ?? 0);
      }
    }
    return totals;
  }, [qaData, activeCategories]);

  const teamAvgByCategory = useMemo(() => {
    const avgs: Record<string, number> = {};
    for (const cat of activeCategories) {
      avgs[cat.id] = nQAs > 0 ? (totalByCat[cat.id] ?? 0) / nQAs : 0;
    }
    return avgs;
  }, [totalByCat, activeCategories, nQAs]);

  const sortedCategories = useMemo(
    () =>
      [...activeCategories]
        .filter((c) => (totalByCat[c.id] ?? 0) > 0)
        .sort((a, b) => (totalByCat[b.id] ?? 0) - (totalByCat[a.id] ?? 0)),
    [activeCategories, totalByCat],
  );

  const nonControllableHours = useMemo(() => {
    let total = 0;
    for (const qa of qaData) {
      for (const [catId, h] of Object.entries(qa.hoursByCategory)) {
        if (excludedCatIds.has(catId)) total += h;
      }
    }
    return total;
  }, [qaData, excludedCatIds]);

  const nonControllableByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const qa of qaData) {
      for (const [catId, h] of Object.entries(qa.hoursByCategory)) {
        if (excludedCatIds.has(catId)) map[catId] = (map[catId] ?? 0) + h;
      }
    }
    return map;
  }, [qaData, excludedCatIds]);

  const excludedCategoriesList = useMemo(
    () =>
      timingCategories
        .filter(
          (c) =>
            excludedCatIds.has(c.id) && (nonControllableByCat[c.id] ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (nonControllableByCat[b.id] ?? 0) -
            (nonControllableByCat[a.id] ?? 0),
        ),
    [timingCategories, excludedCatIds, nonControllableByCat],
  );

  const totalAllHours = useMemo(() => {
    const controllable = Object.values(totalByCat).reduce((s, h) => s + h, 0);
    return controllable + nonControllableHours;
  }, [totalByCat, nonControllableHours]);

  // Recharts data: grouped vertical bars per QA
  const groupedBarData = useMemo(
    () =>
      qaData.map((qa) => {
        const entry: Record<string, string | number> = { qa: qa.name };
        for (const cat of sortedCategories) {
          entry[cat.name] =
            Math.round((qa.hoursByCategory[cat.id] ?? 0) * 100) / 100;
        }
        return entry;
      }),
    [qaData, sortedCategories],
  );

  const efficiencyRanking = useMemo(
    () => [...activeQAs].sort((a, b) => b.efficiencyRate - a.efficiencyRate),
    [activeQAs],
  );

  const stackedPctData = useMemo(
    () =>
      activeQAs.map((qa) => {
        const entry: Record<string, string | number> = { qa: qa.name };
        for (const cat of sortedCategories) {
          entry[cat.name] =
            qa.controllableHours > 0
              ? Math.round(
                  ((qa.hoursByCategory[cat.id] ?? 0) / qa.controllableHours) *
                    1000,
                ) / 10
              : 0;
        }
        return entry;
      }),
    [activeQAs, sortedCategories],
  );

  const [hoveredDonutIdx, setHoveredDonutIdx] = useState<number | null>(null);

  const donutSegments = useMemo(
    () => [
      ...sortedCategories.map((c) => ({
        pct:
          totalAllHours > 0
            ? ((totalByCat[c.id] ?? 0) / totalAllHours) * 100
            : 0,
        color: c.hex_color ?? "#6B7280",
        label: c.name,
        hours: totalByCat[c.id] ?? 0,
      })),
      ...(nonControllableHours > 0
        ? [
            {
              pct:
                totalAllHours > 0
                  ? (nonControllableHours / totalAllHours) * 100
                  : 0,
              color: "#71717A",
              label: "No Productivo",
              hours: nonControllableHours,
            },
          ]
        : []),
    ],
    [sortedCategories, totalByCat, totalAllHours, nonControllableHours],
  );

  const barChartData = sortedCategories.map((cat) => ({
    name: cat.name,
    hours: Math.round((teamAvgByCategory[cat.id] ?? 0) * 100) / 100,
    color: cat.hex_color ?? "#6B7280",
  }));

  const noteText = (() => {
    const top = sortedCategories.slice(0, 3);
    if (top.length === 0) return "";
    if (top.length === 1)
      return `La mayor parte del tiempo del equipo se concentra en ${top[0].name}.`;
    if (top.length === 2)
      return `La mayor parte del tiempo del equipo se concentra en ${top[0].name}, seguido de ${top[1].name}.`;
    return `La mayor parte del tiempo del equipo se concentra en ${top[0].name}, seguido de ${top[1].name} y ${top[2].name}.`;
  })();

  const isLoading = loading || catalogLoading;

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <p className="text-muted-foreground">
          Cargando análisis estadístico QA...
        </p>
      </div>
    );
  }

  if (qaData.length === 0 || sortedCategories.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-muted-foreground">
          Sin datos de QA para el período seleccionado
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── FILA 1: Promedio por área (vertical) + Resumen por QA ───────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        {/* Panel izquierdo: gráfico de barras vertical */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Promedio de horas por área{" "}
              <span className="font-normal normal-case text-muted-foreground/60">
                (por QA)
              </span>
            </h3>
            {noteText && (
              <div className="max-w-[210px] shrink-0 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <p className="text-[10px] leading-relaxed text-blue-400/80">
                  {noteText}
                </p>
              </div>
            )}
          </div>
          <ChartWrapper
            height={Math.max(240, sortedCategories.length * 70 + 90)}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                data={barChartData}
                margin={{ top: 22, right: 12, left: 0, bottom: 48 }}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(128,128,128,0.1)"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  interval={0}
                  angle={-22}
                  textAnchor="end"
                  height={52}
                  padding={{ left: 30, right: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  width={34}
                />
                <RTooltip
                  formatter={(value) => [
                    formatTime(typeof value === "number" ? value : 0),
                    "Promedio equipo",
                  ]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Bar
                  dataKey="hours"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={90}
                  label={({ x, y, width, value }) => {
                    const v = typeof value === "number" ? value : 0;
                    const nx = typeof x === "number" ? x : 0;
                    const ny = typeof y === "number" ? y : 0;
                    const nw = typeof width === "number" ? width : 0;
                    if (!v || v <= 0) return <g />;
                    return (
                      <text
                        x={nx + nw / 2}
                        y={ny - 5}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--foreground)"
                      >
                        {formatTime(v)}
                      </text>
                    );
                  }}
                >
                  {barChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>

        {/* Panel derecho: resumen por QA */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Resumen promedios por QA
          </h3>
          <div className="space-y-3">
            {sortedCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2.5">
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                  style={{ borderColor: cat.hex_color }}
                >
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat.hex_color }}
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {cat.name}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                  {formatTime(teamAvgByCategory[cat.id] ?? 0)}
                </span>
              </div>
            ))}
          </div>

          <div className="my-4 border-t border-border" />

          {/* Total horas válidas */}
          <div
            className="mb-2.5 rounded-lg border p-3"
            style={{
              backgroundColor: "rgba(59,130,246,0.08)",
              borderColor: "rgba(59,130,246,0.25)",
            }}
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400">
              Total horas promedio válidas
            </p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              (Testing + QA Fixed + Retesting)
            </p>
            <p className="mt-1.5 text-xl font-bold text-blue-400">
              {formatTime(avgValidPerQA)}
            </p>
          </div>

          {/* Eficiencia promedio */}
          <div
            className="rounded-lg border p-3"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              borderColor: "rgba(16,185,129,0.25)",
            }}
          >
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              Eficiencia promedio
            </p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">
              Testing efectivo / horas controlables
            </p>
            <p
              className="mt-1.5 text-xl font-bold"
              style={{
                color:
                  avgEfficiency >= 70
                    ? "#10B981"
                    : avgEfficiency >= 50
                      ? "#F59E0B"
                      : "#EF4444",
              }}
            >
              {avgEfficiency.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* ── FILA 2: Comparativo agrupado + Distribución donut ───────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        {/* Panel izquierdo: grouped vertical bar chart per QA */}
        <PanelCard title="Comparativo por QA — Horas por área">
          <ChartWrapper height={300}>
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                data={groupedBarData}
                margin={{ top: 20, right: 12, left: 0, bottom: 56 }}
                barCategoryGap="25%"
                barGap={2}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(128,128,128,0.1)"
                />
                <XAxis
                  dataKey="qa"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={56}
                  padding={{ left: 30, right: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  width={36}
                />
                <RTooltip
                  formatter={(value, name) => [
                    formatTime(typeof value === "number" ? value : 0),
                    String(name ?? ""),
                  ]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                />
                {sortedCategories.map((cat) => (
                  <Bar
                    key={cat.id}
                    dataKey={cat.name}
                    fill={cat.hex_color ?? "#6B7280"}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </PanelCard>

        {/* Panel derecho: donut de distribución + leyenda */}
        <div className="flex flex-col rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Distribución porcentual del tiempo
          </h3>
          <div className="flex justify-center">
            <div className="relative">
              <DonutSVG
                size={140}
                stroke={22}
                segments={donutSegments}
                onSegmentHover={setHoveredDonutIdx}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2">
                {hoveredDonutIdx !== null && donutSegments[hoveredDonutIdx] ? (
                  <>
                    <span
                      className="max-w-[72px] text-center text-[8px] font-bold leading-tight"
                      style={{ color: donutSegments[hoveredDonutIdx].color }}
                    >
                      {donutSegments[hoveredDonutIdx].label.length > 14
                        ? donutSegments[hoveredDonutIdx].label.slice(0, 13) +
                          "…"
                        : donutSegments[hoveredDonutIdx].label}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {formatTime(donutSegments[hoveredDonutIdx].hours)}
                    </span>
                    <span className="text-[9px] tabular-nums text-muted-foreground">
                      {donutSegments[hoveredDonutIdx].pct.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      TOTAL
                    </span>
                    <span className="text-lg font-bold text-foreground">
                      100%
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex-1 space-y-2.5">
            {sortedCategories.map((cat) => {
              const pct =
                totalAllHours > 0
                  ? ((totalByCat[cat.id] ?? 0) / totalAllHours) * 100
                  : 0;
              return (
                <div key={cat.id} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.hex_color }}
                  />
                  <span className="flex-1 truncate text-foreground">
                    {cat.name}
                  </span>
                  <span
                    className="shrink-0 font-semibold tabular-nums"
                    style={{ color: cat.hex_color }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
            {nonControllableHours > 0 && (
              <div>
                {/* Fila encabezado No Productivo */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-500" />
                  <span className="flex-1 truncate font-semibold text-zinc-400">
                    Tiempo No Productivo*
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-zinc-400">
                    {totalAllHours > 0
                      ? ((nonControllableHours / totalAllHours) * 100).toFixed(
                          1,
                        )
                      : "0.0"}
                    %
                  </span>
                </div>
                {/* Sub-filas de categorías excluidas */}
                <div className="mt-1.5 space-y-1.5 border-l-2 border-zinc-700 pl-3">
                  {excludedCategoriesList.map((cat) => {
                    const pct =
                      totalAllHours > 0
                        ? ((nonControllableByCat[cat.id] ?? 0) /
                            totalAllHours) *
                          100
                        : 0;
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.hex_color }}
                        />
                        <span className="flex-1 truncate text-muted-foreground">
                          {cat.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                          {formatTime(nonControllableByCat[cat.id] ?? 0)}
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-[10px] text-zinc-500">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {nonControllableHours > 0 && (
            <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">
              * Horas que no forman parte de la nueva métrica de eficiencia.
            </p>
          )}
        </div>
      </div>

      {/* ── FILA 3: Ranking + Tendencia + Composición % ─────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr_1fr]">
        {/* Ranking de testing efectivo */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ranking de testing efectivo
          </h3>
          <div className="space-y-3">
            {efficiencyRanking.map((qa, i) => {
              const color =
                qa.efficiencyRate >= 70
                  ? "#10B981"
                  : qa.efficiencyRate >= 50
                    ? "#F59E0B"
                    : "#EF4444";
              return (
                <div key={qa.name}>
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 shrink-0 text-right text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="truncate">{qa.name}</span>
                    </span>
                    <span
                      className="ml-2 shrink-0 font-semibold tabular-nums"
                      style={{ color }}
                    >
                      {qa.efficiencyRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(qa.efficiencyRate, 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="mt-5 rounded-xl p-4"
            style={{
              backgroundColor: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Eficiencia Promedio del Equipo
            </p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{
                color:
                  avgEfficiency >= 70
                    ? "#10B981"
                    : avgEfficiency >= 50
                      ? "#F59E0B"
                      : "#EF4444",
              }}
            >
              {avgEfficiency.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Tendencia de horas promedio por área */}
        <PanelCard title="Tendencia de horas promedio por área">
          <ChartWrapper height={280}>
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <LineChart
                data={groupedBarData}
                margin={{ top: 12, right: 16, left: 0, bottom: 52 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(128,128,128,0.1)"
                />
                <XAxis
                  dataKey="qa"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={52}
                  padding={{ left: 30, right: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  width={34}
                />
                <RTooltip
                  formatter={(value, name) => [
                    formatTime(typeof value === "number" ? value : 0),
                    String(name ?? ""),
                  ]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                />
                {sortedCategories.map((cat) => (
                  <Line
                    key={cat.id}
                    type="monotone"
                    dataKey={cat.name}
                    stroke={cat.hex_color ?? "#6B7280"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </PanelCard>

        {/* Composición de horas por QA (porcentual) */}
        <PanelCard title="Composición de horas por QA (porcentual)">
          <ChartWrapper height={280}>
            <ResponsiveContainer width="100%" height="100%" minWidth={1}>
              <BarChart
                data={stackedPctData}
                margin={{ top: 12, right: 16, left: 0, bottom: 52 }}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(128,128,128,0.1)"
                />
                <XAxis
                  dataKey="qa"
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={52}
                  padding={{ left: 30, right: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  allowDataOverflow
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  width={44}
                />
                <RTooltip
                  formatter={(value, name) => [
                    `${(typeof value === "number" ? value : 0).toFixed(1)}%`,
                    String(name ?? ""),
                  ]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                />
                {sortedCategories.map((cat) => (
                  <Bar
                    key={cat.id}
                    dataKey={cat.name}
                    stackId="pct"
                    fill={cat.hex_color ?? "#6B7280"}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </PanelCard>
      </div>

      {/* ── Nota al pie ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
        <span className="shrink-0 text-[10px] leading-relaxed text-muted-foreground">
          ⓘ
        </span>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground/70">Nota:</strong>{" "}
          Todos los promedios están calculados en horas por QA. La eficiencia se
          calcula únicamente con <em>QA Testing + QA Fixed + Retesting</em>{" "}
          sobre <strong>160 horas disponibles por QA</strong> (20 días
          laborales).
        </p>
      </div>
    </div>
  );
}
