"use client";

import React, { useState, useEffect } from "react";
import {
  SquadTimingMetrics,
  QATimingMetrics,
  TaskTiming,
  TimingQAEntry,
  Task,
  TshirtSize,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import { formatTime } from "@/lib/timingUtils";

interface TimingMetricsProps {
  metrics: SquadTimingMetrics[];
  loading?: boolean;
}

interface Tooltip {
  visible: boolean;
  x: number;
  y: number;
  content: string;
}

// Componente KPI Card
interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: string;
  trend?: number;
  color?: string;
}

function KPICard({
  label,
  value,
  unit = "",
  icon = "📊",
  trend,
  color = "#3B82F6",
}: KPICardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 font-medium">{label}</p>
          <p className="text-2xl font-bold mt-2" style={{ color }}>
            {value}
            {unit && <span className="text-lg text-gray-500 ml-1">{unit}</span>}
          </p>
          {trend !== undefined && (
            <p
              className={`text-xs mt-2 font-semibold ${trend >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
            </p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

// Gráfico de distribución de horas (tipo donut)
export function TimingMetricsDistributionChart({
  metrics,
  loading = false,
}: TimingMetricsProps) {
  const [tooltip, setTooltip] = useState<Tooltip>({
    visible: false,
    x: 0,
    y: 0,
    content: "",
  });

  useEffect(() => {
    const hide = () => setTooltip((t) => ({ ...t, visible: false }));
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">Cargando gráficos...</p>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const colors = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B"];

  const handleTooltipShow = (e: React.MouseEvent<Element>, content: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content,
    });
  };

  const handleTooltipHide = () => {
    setTooltip({ ...tooltip, visible: false });
  };

  return (
    <div className="rounded-lg bg-white p-6">
      <h3 className="mb-6 text-lg font-semibold">
        Distribución General de Horas
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Gráfico circular */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-64 h-64">
            {/* Círculo SVG simple */}
            <svg
              className="w-full h-full transform -rotate-90"
              viewBox="0 0 100 100"
            >
              {metrics.map((metric, index) => {
                const offset = metrics.slice(0, index).reduce((acc, m) => {
                  return (
                    acc +
                    (m.total_hours /
                      metrics.reduce((sum, x) => sum + x.total_hours, 0)) *
                      360
                  );
                }, 0);

                const percentage =
                  (metric.total_hours /
                    metrics.reduce((sum, x) => sum + x.total_hours, 0)) *
                  360;
                const radius = 35;
                const circumference = 2 * Math.PI * radius;
                const strokeDashoffset =
                  circumference - (percentage / 360) * circumference;
                const total = metrics.reduce(
                  (sum, x) => sum + x.total_hours,
                  0,
                );
                const percentageValue = (metric.total_hours / total) * 100;

                return (
                  <circle
                    key={metric.product_type}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={colors[index % colors.length]}
                    strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onMouseEnter={(e) =>
                      handleTooltipShow(
                        e,
                        `${metric.product_type}: ${formatTime(metric.total_hours)} (${percentageValue.toFixed(1)}%)`,
                      )
                    }
                    onMouseLeave={handleTooltipHide}
                    style={{
                      transform: `rotate(${offset}deg)`,
                      transformOrigin: "50px 50px",
                      transition: "all 0.3s ease",
                    }}
                  />
                );
              })}
              <text
                x="50"
                y="55"
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill="#374151"
              >
                Total
              </text>
              <text
                x="50"
                y="65"
                textAnchor="middle"
                fontSize="10"
                fill="#6B7280"
              >
                {formatTime(metrics.reduce((sum, m) => sum + m.total_hours, 0))}
              </text>
            </svg>
          </div>
        </div>

        {/* Leyenda detallada */}
        <div className="space-y-4">
          {metrics.map((metric, index) => {
            const total = metrics.reduce((sum, m) => sum + m.total_hours, 0);
            const percentage = (metric.total_hours / total) * 100;

            return (
              <div
                key={metric.product_type}
                className="border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
                onMouseEnter={(e) =>
                  handleTooltipShow(
                    e,
                    `${metric.product_type}: ${formatTime(metric.total_hours)} (${percentage.toFixed(1)}%)`,
                  )
                }
                onMouseLeave={handleTooltipHide}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="font-medium text-gray-900">
                      {metric.product_type}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-700">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {formatTime(metric.total_hours)} · {metric.task_count} tareas
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip */}
      <div
        className="fixed bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50"
        style={{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
          transform: "translate(-50%, -100%)",
          opacity: tooltip.visible ? 1 : 0,
          visibility: tooltip.visible ? "visible" : "hidden",
          transitionProperty: "opacity, visibility",
          transitionDuration: "100ms",
          transitionTimingFunction: "ease-in-out",
          willChange: "opacity, visibility",
        }}
      >
        {tooltip.content}
        <div
          className="absolute w-2 h-2 bg-gray-900"
          style={{
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </div>
    </div>
  );
}

// Gráfico de comparativa y benchmarking
export function TimingMetricsComparisonChart({
  metrics,
  loading = false,
}: TimingMetricsProps) {
  const { timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);
  const slugToId = timingCategories.reduce(
    (a, c) => {
      a[c.slug] = c.id;
      return a;
    },
    {} as Record<string, string>,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
        <p className="text-gray-500">Cargando gráficos...</p>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6">
      <h3 className="mb-6 text-lg font-semibold">
        Comparativa por Producto: Horas Promedio por Tarea
      </h3>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-3 px-4 font-semibold text-gray-800">
                Producto
              </th>
              {activeCategories.map((cat) => (
                <th
                  key={cat.id}
                  className="text-center py-3 px-4 font-semibold text-gray-700 whitespace-nowrap"
                  title={cat.name}
                >
                  {cat.name}
                </th>
              ))}
              <th
                className="text-center py-3 px-4 font-semibold text-gray-700 whitespace-nowrap"
                title="Horas promedio totales por tarea"
              >
                Total
              </th>
              <th
                className="text-center py-3 px-4 font-semibold text-gray-700 whitespace-nowrap"
                title="Cantidad de tareas registradas"
              >
                Tareas
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, idx) => (
              <tr
                key={metric.product_type}
                className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}
              >
                <td className="py-4 px-4 font-medium text-gray-900">
                  {metric.product_type}
                </td>
                {activeCategories.map((cat) => {
                  const avg = metric.averages_by_category?.[cat.id] ?? 0;
                  const pct =
                    metric.avg_total_hours > 0
                      ? (avg / metric.avg_total_hours) * 100
                      : 0;
                  return (
                    <td key={cat.id} className="py-4 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <div className="text-right">
                          <p
                            className="font-semibold"
                            style={{ color: cat.hex_color }}
                          >
                            {avg > 0 ? formatTime(avg) : "0h"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {pct.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td className="py-4 px-4 whitespace-nowrap">
                  <div className="flex items-center justify-center">
                    <div className="text-right">
                      <p className="font-bold text-gray-900">
                        {formatTime(metric.avg_total_hours)}
                      </p>
                      <p className="text-xs text-gray-500">promedio</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                    {metric.task_count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div className="mt-8 pt-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
        {metrics.map((metric) => {
          const effectiveId = slugToId["effective_testing"];
          const retestId = slugToId["qa_ready_for_testing"];
          const avgEffective = effectiveId
            ? (metric.averages_by_category?.[effectiveId] ?? 0)
            : 0;
          const avgRetest = retestId
            ? (metric.averages_by_category?.[retestId] ?? 0)
            : 0;
          const totalWaiting = activeCategories
            .filter((c) => c.slug.startsWith("waiting_"))
            .reduce(
              (s, c) => s + (metric.averages_by_category?.[c.id] ?? 0),
              0,
            );
          const efficiency =
            metric.avg_total_hours > 0
              ? (avgEffective / metric.avg_total_hours) * 100
              : 0;

          return (
            <div
              key={metric.product_type}
              className="border border-gray-200 bg-gray-50 p-4 rounded-lg"
            >
              <p className="text-sm font-semibold text-gray-900 mb-3">
                {metric.product_type}
              </p>
              <div className="text-xs space-y-2 text-gray-600">
                <div className="flex justify-between">
                  <span>Eficiencia</span>
                  <span
                    className={`font-bold ${efficiency > 70 ? "text-green-600" : efficiency > 50 ? "text-yellow-600" : "text-red-600"}`}
                  >
                    {efficiency.toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Esperas promedio</span>
                  <span className="font-bold text-gray-700">
                    {formatTime(totalWaiting)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Calidad (retest)</span>
                  <span
                    className={`font-bold ${avgRetest < 0.5 ? "text-green-600" : avgRetest < 1 ? "text-yellow-600" : "text-red-600"}`}
                  >
                    {formatTime(avgRetest)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SquadTimingSummaryCard({
  metric,
}: {
  metric: SquadTimingMetrics;
}) {
  const { timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);
  const slugToId = timingCategories.reduce(
    (a, c) => {
      a[c.slug] = c.id;
      return a;
    },
    {} as Record<string, string>,
  );

  const effectiveTestingId = slugToId["effective_testing"];
  const retestId = slugToId["qa_ready_for_testing"];
  const totalEffective = effectiveTestingId
    ? (metric.totals_by_category?.[effectiveTestingId] ?? 0)
    : 0;
  const totalRetest = retestId
    ? (metric.totals_by_category?.[retestId] ?? 0)
    : 0;

  // Calcular métricas derivadas
  const totalWaitingHours = activeCategories
    .filter((c) => c.slug.startsWith("waiting_"))
    .reduce((s, c) => s + (metric.totals_by_category?.[c.id] ?? 0), 0);

  const efficiencyRate =
    metric.total_hours > 0 ? (totalEffective / metric.total_hours) * 100 : 0;
  const retestRate =
    totalEffective > 0 ? (totalRetest / totalEffective) * 100 : 0;
  const qualityScore = Math.max(0, 100 - retestRate);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-gray-200">
        <h3 className="text-xl font-bold text-gray-900">
          {metric.product_type}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {metric.task_count} tarea{metric.task_count !== 1 ? "s" : ""}{" "}
          registrada{metric.task_count !== 1 ? "s" : ""}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Horas Totales"
          value={formatTime(metric.total_hours)}
          unit=""
          icon="⏱️"
          color="#3B82F6"
        />
        <KPICard
          label="Tasa de Eficiencia"
          value={efficiencyRate.toFixed(1)}
          unit="%"
          icon="⚡"
          color={
            efficiencyRate > 70
              ? "#10B981"
              : efficiencyRate > 50
                ? "#F59E0B"
                : "#EF4444"
          }
        />
        <KPICard
          label="Puntuación de Calidad"
          value={qualityScore.toFixed(1)}
          unit="/100"
          icon="⭐"
          color={
            qualityScore > 80
              ? "#10B981"
              : qualityScore > 60
                ? "#F59E0B"
                : "#EF4444"
          }
        />
        <KPICard
          label="Promedio por Tarea"
          value={formatTime(metric.avg_total_hours)}
          unit=""
          icon="📈"
          color="#8B5CF6"
        />
      </div>

      {/* Detailed Breakdown */}
      <div className="p-6 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Horas por Fase */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">
            Distribución de Horas
          </h4>
          <div className="space-y-3">
            {activeCategories.map((cat) => {
              const hours = metric.totals_by_category?.[cat.id] ?? 0;
              const pct =
                metric.total_hours > 0 ? (hours / metric.total_hours) * 100 : 0;
              return (
                <div key={cat.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">
                      {cat.name}
                    </span>
                    <span
                      className="font-semibold"
                      style={{ color: cat.hex_color }}
                    >
                      {formatTime(hours)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="rounded-full h-2 transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: cat.hex_color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Análisis */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">
            Análisis de Desempeño
          </h4>
          <div className="space-y-4">
            {/* Efficiency Analysis */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-xs text-gray-600 font-medium">Productividad</p>
              <p className="text-2xl font-bold text-blue-600 mt-2">
                {efficiencyRate.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-600 mt-2">
                {formatTime(totalWaitingHours)} en esperas / bloqueantes
              </p>
            </div>

            {/* Retest Analysis */}
            <div
              className={`${retestRate > 20 ? "bg-red-50" : retestRate > 10 ? "bg-yellow-50" : "bg-green-50"} p-4 rounded-lg`}
            >
              <p className="text-xs text-gray-600 font-medium">
                Tasa de Retest
              </p>
              <p
                className={`text-2xl font-bold mt-2 ${retestRate > 20 ? "text-red-600" : retestRate > 10 ? "text-yellow-600" : "text-green-600"}`}
              >
                {retestRate.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-600 mt-2">
                {retestRate < 10
                  ? "✓ Excelente"
                  : retestRate < 20
                    ? "⚠ Acceptable"
                    : "✗ Revisar"}
              </p>
            </div>

            {/* Workload */}
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-xs text-gray-600 font-medium">
                Carga de Trabajo
              </p>
              <p className="text-2xl font-bold text-purple-600 mt-2">
                {formatTime(metric.avg_total_hours)}
              </p>
              <p className="text-xs text-gray-600 mt-2">promedio por tarea</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// QA METRICS COMPONENTS
// ==========================================

const QA_CHART_COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#6366F1",
  "#14B8A6",
];

interface QATimingMetricsProps {
  qaMetrics: QATimingMetrics[];
  loading?: boolean;
}

// Bar chart comparing total hours per QA member
export function QAHoursBarChart({
  qaMetrics,
  loading = false,
}: QATimingMetricsProps) {
  const [tooltip, setTooltip] = useState<Tooltip>({
    visible: false,
    x: 0,
    y: 0,
    content: "",
  });
  const { timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);

  useEffect(() => {
    const hide = () => setTooltip((t) => ({ ...t, visible: false }));
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">Cargando métricas QA...</p>
      </div>
    );
  }

  if (!qaMetrics || qaMetrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-500">No hay datos de QA disponibles</p>
      </div>
    );
  }

  const maxTotal = Math.max(...qaMetrics.map((q) => q.total_hours));
  const barMaxWidth = maxTotal > 0 ? maxTotal : 1;

  const handleBarSectionMouseEnter = (
    e: React.MouseEvent<HTMLDivElement>,
    content: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content,
    });
  };

  const handleMouseLeave = () => {
    setTooltip({ ...tooltip, visible: false });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-6 text-lg font-semibold text-gray-900">
        Horas Totales por QA
      </h3>

      <div className="space-y-4">
        {qaMetrics
          .sort((a, b) => b.total_hours - a.total_hours)
          .map((qa) => {
            return (
              <div
                key={qa.qa_name}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-900 flex-1 break-words">
                    {qa.qa_name}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-gray-500 ml-3 flex-shrink-0">
                    <span>
                      {qa.task_count} tarea{qa.task_count !== 1 ? "s" : ""}
                    </span>
                    <span className="font-bold text-gray-700">
                      {formatTime(qa.total_hours)}
                    </span>
                  </div>
                </div>

                {/* Stacked bar */}
                <div className="flex h-8 w-full rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                  {activeCategories.map((cat) => {
                    const hours = qa.totals_by_category?.[cat.id] ?? 0;
                    return (
                      <div
                        key={cat.id}
                        onMouseEnter={(e) =>
                          handleBarSectionMouseEnter(
                            e,
                            `${cat.name}: ${formatTime(hours)}`,
                          )
                        }
                        onMouseLeave={handleMouseLeave}
                        className="h-full transition-all hover:opacity-80 cursor-pointer relative group"
                        style={{
                          width: `${(hours / barMaxWidth) * 100}%`,
                          backgroundColor: cat.hex_color,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Tooltip */}
      <div
        className="fixed bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50"
        style={{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
          transform: "translate(-50%, -100%)",
          opacity: tooltip.visible ? 1 : 0,
          visibility: tooltip.visible ? "visible" : "hidden",
          transitionProperty: "opacity, visibility",
          transitionDuration: "100ms",
          transitionTimingFunction: "ease-in-out",
          willChange: "opacity, visibility",
        }}
      >
        {tooltip.content}
        <div
          className="absolute w-2 h-2 bg-gray-900"
          style={{
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </div>

      {/* Leyenda */}
      <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-3">
          Tipos de Actividades:
        </p>
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          {activeCategories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: cat.hex_color }}
              />
              <span>{cat.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Redistribuye las horas de qa_entries de un timing según assigned_qa.
 * - Con assigned_qa: suma todas las entradas y divide equitativamente entre ellos.
 * - Sin assigned_qa: devuelve una entrada por qa_entry con sus horas originales.
 * Retorna un Map<qaName, { totalHours, hours_by_category }>.
 */
function redistributeTimingHours(
  qaEntries: TimingQAEntry[],
  assignedQAs: string[],
): Map<string, { totalHours: number; hours_by_category: Record<string, number> }> {
  const result = new Map<
    string,
    { totalHours: number; hours_by_category: Record<string, number> }
  >();

  if (assignedQAs.length > 0) {
    let total = 0;
    const byCategory: Record<string, number> = {};
    for (const entry of qaEntries) {
      total += Number(entry.total_hours) || 0;
      for (const [k, v] of Object.entries(entry.hours_by_category ?? {})) {
        byCategory[k] = (byCategory[k] ?? 0) + Number(v);
      }
    }
    const share = 1 / assignedQAs.length;
    for (const qa of assignedQAs) {
      result.set(qa, {
        totalHours: total * share,
        hours_by_category: Object.fromEntries(
          Object.entries(byCategory).map(([k, v]) => [k, v * share]),
        ),
      });
    }
  } else {
    for (const entry of qaEntries) {
      const existing = result.get(entry.qa_name);
      if (existing) {
        existing.totalHours += Number(entry.total_hours) || 0;
        for (const [k, v] of Object.entries(entry.hours_by_category ?? {})) {
          existing.hours_by_category[k] =
            (existing.hours_by_category[k] ?? 0) + Number(v);
        }
      } else {
        result.set(entry.qa_name, {
          totalHours: Number(entry.total_hours) || 0,
          hours_by_category: { ...(entry.hours_by_category ?? {}) },
        });
      }
    }
  }

  return result;
}

// Efficiency & Retest comparison bar chart
interface QAEfficiencyChartProps extends QATimingMetricsProps {
  timings?: TaskTiming[];
  tasks?: Task[];
}

export function QAEfficiencyChart({
  qaMetrics,
  loading = false,
  timings = [],
  tasks = [],
}: QAEfficiencyChartProps) {
  const [expandedQA, setExpandedQA] = useState<string | null>(null);
  const { timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);
  const slugToId = timingCategories.reduce(
    (a, c) => {
      a[c.slug] = c.id;
      return a;
    },
    {} as Record<string, string>,
  );

  if (loading || !qaMetrics || qaMetrics.length === 0) {
    return null;
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const toggleExpand = (qaName: string) => {
    setExpandedQA((prev) => (prev === qaName ? null : qaName));
  };

  // Get task details for a specific QA — uses assigned_qa (not registerer) to
  // match the server-side redistribution logic in getQATimingMetrics.
  const getTaskDetailsForQA = (qaName: string) => {
    const taskDetails: {
      taskId: string;
      taskName: string;
      taskLink: string;
      tshirtSize: string;
      project_type: string;
      hours_by_category: Record<string, number>;
      total: number;
    }[] = [];

    for (const timing of timings) {
      if (!timing.qa_entries || timing.qa_entries.length === 0) continue;
      const task = taskMap.get(timing.task_id);
      if (!task) continue;

      const assignedQAs = (task.assigned_qa ?? []).filter(Boolean) as string[];
      const redistribution = redistributeTimingHours(timing.qa_entries, assignedQAs);
      const qaData = redistribution.get(qaName);
      if (!qaData) continue;

      taskDetails.push({
        taskId: timing.task_id,
        taskName: task.name || "Tarea desconocida",
        taskLink: task.task_link || "",
        tshirtSize: task.tshirt_size || "",
        project_type: task.project_type || "",
        hours_by_category: qaData.hours_by_category,
        total: qaData.totalHours,
      });
    }

    return taskDetails;
  };

  const hasExpandableData = timings.length > 0 && tasks.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
      <h3 className="mb-6 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Eficiencia y Retest por QA
      </h3>

      {hasExpandableData && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Haz clic en una fila para ver el detalle de tareas por QA
        </p>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
              <th
                className="text-left py-3 px-3 font-semibold text-gray-800 dark:text-gray-200"
                title="Nombre del QA"
              >
                QA
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Cantidad de tareas asignadas"
              >
                Tareas
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Horas totales en estado QA - Testing (pruebas activas)"
              >
                QA Testing
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Horas totales en estado QA - Ready for Testing (re-encoladas para test)"
              >
                QA Ready
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Porcentaje de horas en testing efectivo vs horas totales. Mayor % = mejor aprovechamiento del tiempo"
              >
                Eficiencia
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Porcentaje de horas de retest respecto al testing efectivo. Menor % = mejor calidad del desarrollo"
              >
                Tasa Retest
              </th>
              <th
                className="text-center py-3 px-3 font-semibold text-gray-700 dark:text-gray-300"
                title="Horas promedio invertidas por tarea"
              >
                Promedio/Tarea
              </th>
            </tr>
          </thead>
          <tbody>
            {qaMetrics
              .sort((a, b) => b.efficiency_rate - a.efficiency_rate)
              .map((qa, idx) => {
                const isExpanded = expandedQA === qa.qa_name;
                const taskDetails = isExpanded
                  ? getTaskDetailsForQA(qa.qa_name)
                  : [];

                return (
                  <React.Fragment key={qa.qa_name}>
                    <tr
                      className={`${idx % 2 === 0 ? "bg-gray-50 dark:bg-[#1a2235]" : "bg-white dark:bg-[#151e2f]"} ${hasExpandableData ? "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" : ""} ${isExpanded ? "bg-blue-50 dark:bg-blue-900/30" : ""}`}
                      onClick={
                        hasExpandableData
                          ? () => toggleExpand(qa.qa_name)
                          : undefined
                      }
                    >
                      <td className="py-3 px-3 font-medium text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          {hasExpandableData && (
                            <span
                              className={`text-gray-400 text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            >
                              ▶
                            </span>
                          )}
                          {qa.qa_name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-block bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                          {qa.task_count}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-blue-600 whitespace-nowrap">
                        {formatTime(slugToId["effective_testing"]
                          ? (qa.totals_by_category?.[
                              slugToId["effective_testing"]
                            ] ?? 0)
                          : 0
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-red-600 whitespace-nowrap">
                        {formatTime(slugToId["qa_ready_for_testing"]
                          ? (qa.totals_by_category?.[slugToId["qa_ready_for_testing"]] ?? 0)
                          : 0
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            qa.efficiency_rate > 70
                              ? "bg-green-100 text-green-700"
                              : qa.efficiency_rate > 50
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {qa.efficiency_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            qa.retest_rate < 10
                              ? "bg-green-100 text-green-700"
                              : qa.retest_rate < 20
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {qa.retest_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-purple-600 whitespace-nowrap">
                        {formatTime(qa.avg_total_hours)}
                      </td>
                    </tr>

                    {/* Filas expandibles con detalle de tareas */}
                    {isExpanded && taskDetails.length > 0 && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="overflow-x-auto bg-[#111827] border-t-2 border-b-2 border-indigo-300 dark:border-indigo-800">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="bg-indigo-950/60 border-b border-indigo-800/80">
                                  <th className="text-left py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300">
                                    #
                                  </th>
                                  <th
                                    className="text-left py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300"
                                    title="Nombre de la tarea con enlace al ticket"
                                  >
                                    Tarea
                                  </th>
                                  <th
                                    className="text-center py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300"
                                    title="Complejidad asignada a la tarea"
                                  >
                                    Complejidad
                                  </th>
                                  <th
                                    className="text-center py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300"
                                    title="Clasificación de la tarea (Nueva funcionalidad, Bug fix, etc.)"
                                  >
                                    Tipo Proyecto
                                  </th>
                                  {activeCategories.map((cat) => (
                                    <th
                                      key={cat.id}
                                      className="text-center py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                                      title={cat.name}
                                    >
                                      {cat.name}
                                    </th>
                                  ))}
                                  <th
                                    className="text-center py-2 px-3 font-semibold text-indigo-700 dark:text-indigo-300"
                                    title="Total de horas invertidas por el QA en esta tarea"
                                  >
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {taskDetails.map((detail, taskIdx) => (
                                  <tr
                                    key={detail.taskId}
                                    className={
                                      taskIdx % 2 === 0
                                        ? "bg-[#1a2235] text-slate-200 border-b border-white/5"
                                        : "bg-[#151e2f] text-slate-200 border-b border-white/5"
                                    }
                                  >
                                    <td className="py-2 px-3 text-slate-400 dark:text-slate-500 font-medium">
                                      {taskIdx + 1}
                                    </td>
                                    <td className="py-2 px-3">
                                      {detail.taskLink ? (
                                        <a
                                          href={detail.taskLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {detail.taskName}
                                        </a>
                                      ) : (
                                        <span className="font-medium text-slate-700 dark:text-slate-300">
                                          {detail.taskName}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {detail.tshirtSize && (
                                        <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                                          {detail.tshirtSize}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {detail.project_type && (
                                        <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-1.5 py-0.5 text-xs text-purple-700 whitespace-nowrap">
                                          {detail.project_type}
                                        </span>
                                      )}
                                    </td>
                                    {activeCategories.map((cat) => (
                                      <td
                                        key={cat.id}
                                        className="py-2 px-3 text-center font-medium whitespace-nowrap"
                                        style={{ color: cat.hex_color }}
                                      >
                                        {formatTime(Number(
                                          detail.hours_by_category?.[cat.id] ??
                                            0,
                                        ))}
                                      </td>
                                    ))}
                                    <td
                                      className="py-2 px-3 text-center font-bold whitespace-nowrap"
                                      style={{ color: "#F59E0B" }}
                                    >
                                      {formatTime(Number(detail.total))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && taskDetails.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-3 px-6 text-center text-xs text-gray-400 italic bg-slate-50 border-t border-b border-blue-200"
                        >
                          No se encontraron detalles de tareas para este QA en
                          el período seleccionado
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// QA Summary Cards grid
export function QASummaryCards({
  qaMetrics,
  loading = false,
}: QATimingMetricsProps) {
  const { timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);
  const [tooltip, setTooltip] = useState<Tooltip>({
    visible: false,
    x: 0,
    y: 0,
    content: "",
  });

  useEffect(() => {
    const hide = () => setTooltip((t) => ({ ...t, visible: false }));
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  const handleBarTooltipShow = (
    e: React.MouseEvent<HTMLDivElement>,
    content: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content,
    });
  };
  const handleBarTooltipHide = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-gray-200 h-48" />
        ))}
      </div>
    );
  }

  if (!qaMetrics || qaMetrics.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {qaMetrics
          .sort((a, b) => b.total_hours - a.total_hours)
          .map((qa, idx) => {
            const color = QA_CHART_COLORS[idx % QA_CHART_COLORS.length];
            const qualityScore = Math.max(0, 100 - qa.retest_rate);

            return (
              <div
                key={qa.qa_name}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                {/* Header colored accent */}
                <div className="h-1.5" style={{ backgroundColor: color }} />
                <div className="p-5">
                  <h4 className="text-base font-bold text-gray-900 mb-3">
                    {qa.qa_name}
                  </h4>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Horas Totales</p>
                      <p className="font-bold text-gray-900">
                        {formatTime(qa.total_hours)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Tareas</p>
                      <p className="font-bold text-gray-900">{qa.task_count}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Eficiencia</p>
                      <p
                        className={`font-bold ${
                          qa.efficiency_rate > 70
                            ? "text-green-600"
                            : qa.efficiency_rate > 50
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {qa.efficiency_rate.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Calidad</p>
                      <p
                        className={`font-bold ${
                          qualityScore > 80
                            ? "text-green-600"
                            : qualityScore > 60
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {qualityScore.toFixed(0)}/100
                      </p>
                    </div>
                  </div>

                  {/* Mini stacked bar */}
                  <div className="mt-4">
                    <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
                      {activeCategories.map((cat) => {
                        const hours = qa.totals_by_category?.[cat.id] ?? 0;
                        const pct =
                          qa.total_hours > 0
                            ? (hours / qa.total_hours) * 100
                            : 0;
                        return (
                          <div
                            key={cat.id}
                            onMouseEnter={(e) =>
                              handleBarTooltipShow(
                                e,
                                `${cat.name}: ${formatTime(hours)} (${pct.toFixed(0)}%)`,
                              )
                            }
                            onMouseLeave={handleBarTooltipHide}
                            className="h-full cursor-pointer hover:opacity-80 transition-opacity"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: cat.hex_color,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      {/* Tooltip barra mini */}
      <div
        className="fixed bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50"
        style={{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
          transform: "translate(-50%, -100%)",
          opacity: tooltip.visible ? 1 : 0,
          visibility: tooltip.visible ? "visible" : "hidden",
          transitionProperty: "opacity, visibility",
          transitionDuration: "100ms",
          transitionTimingFunction: "ease-in-out",
          willChange: "opacity, visibility",
        }}
      >
        {tooltip.content}
        <div
          className="absolute w-2 h-2 bg-gray-900"
          style={{
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </div>
    </>
  );
}

// ============================================================================
// Comparativa de QA por Complejidad y Tipo Proyecto
// ============================================================================

interface TshirtSizeComparisonProps {
  timings: TaskTiming[];
  tasks: Task[];
  loading?: boolean;
}

interface QATaskEntry {
  qaName: string;
  taskId: string;
  taskName: string;
  taskLink: string;
  totalHours: number;
  hours_by_category: Record<string, number>;
}

interface SizeGroupData {
  tshirtSize: TshirtSize;
  project_type: string;
  expectedMin: number;
  expectedMax: number;
  entries: QATaskEntry[];
  avgHours: number;
  minHours: number;
  maxHours: number;
}

function getDeviationLevel(
  totalHours: number,
  expectedMin: number,
  expectedMax: number,
): "under" | "normal" | "over" | "critical" {
  if (totalHours < expectedMin * 0.5) return "under";
  if (totalHours <= expectedMax) return "normal";
  if (totalHours <= expectedMax * 1.5) return "over";
  return "critical";
}

function getDeviationBadge(level: "under" | "normal" | "over" | "critical") {
  switch (level) {
    case "under":
      return {
        label: "Bajo esperado",
        cls: "bg-blue-100 text-blue-700 border-blue-200",
      };
    case "normal":
      return {
        label: "Normal",
        cls: "bg-green-100 text-green-700 border-green-200",
      };
    case "over":
      return {
        label: "Sobre esperado",
        cls: "bg-yellow-100 text-yellow-700 border-yellow-200",
      };
    case "critical":
      return {
        label: "Exceso significativo",
        cls: "bg-red-100 text-red-700 border-red-200",
      };
  }
}

export function TshirtSizeComparison({
  timings,
  tasks,
  loading = false,
}: TshirtSizeComparisonProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [barTooltip, setBarTooltip] = useState<Tooltip>({
    visible: false,
    x: 0,
    y: 0,
    content: "",
  });
  const { complexities, timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);

  useEffect(() => {
    const hide = () => setBarTooltip((t) => ({ ...t, visible: false }));
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, []);

  // Derivar equivalente dinámico de TSHIRT_SIZE_HOURS y TSHIRT_SIZES desde el catálogo
  const sizeHoursMap = Object.fromEntries(
    complexities.map((c) => [c.name, { min: c.min_hours, max: c.max_hours }]),
  );
  const sizeOrder = complexities
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((c) => c.name);

  const handleBarTooltipShow = (
    e: React.MouseEvent<HTMLDivElement>,
    content: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setBarTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      content,
    });
  };

  const handleBarTooltipHide = () => {
    setBarTooltip((prev) => ({ ...prev, visible: false }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-gray-200 h-32" />
        ))}
      </div>
    );
  }

  if (!timings || timings.length === 0 || !tasks || tasks.length === 0) {
    return null;
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Build groups by (tshirtSize, project_type) — all timings across all periods
  const groupMap = new Map<string, SizeGroupData>();

  for (const timing of timings) {
    if (!timing.qa_entries) continue;
    const task = taskMap.get(timing.task_id);
    if (!task || !task.tshirt_size || !task.project_type) continue;

    const key = `${task.tshirt_size}|${task.project_type}`;
    const expected = sizeHoursMap[task.tshirt_size];
    if (!expected) continue;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        tshirtSize: task.tshirt_size as TshirtSize,
        project_type: task.project_type,
        expectedMin: expected.min,
        expectedMax: expected.max,
        entries: [],
        avgHours: 0,
        minHours: Infinity,
        maxHours: 0,
      });
    }

    const group = groupMap.get(key)!;

    const assignedQAs = (task.assigned_qa ?? []).filter(Boolean) as string[];
    const redistribution = redistributeTimingHours(timing.qa_entries, assignedQAs);

    for (const [qaName, data] of redistribution) {
      group.entries.push({
        qaName,
        taskId: timing.task_id,
        taskName: task.name,
        taskLink: task.task_link || "",
        totalHours: data.totalHours,
        hours_by_category: data.hours_by_category,
      });
    }
  }

  // Calculate aggregates
  const groups = Array.from(groupMap.values())
    .filter((g) => g.entries.length >= 1)
    .map((g) => {
      const hours = g.entries.map((e) => e.totalHours);
      g.avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;
      g.minHours = Math.min(...hours);
      g.maxHours = Math.max(...hours);
      return g;
    })
    .sort((a, b) => {
      const sizeIndexDiff =
        sizeOrder.indexOf(a.tshirtSize) - sizeOrder.indexOf(b.tshirtSize);
      if (sizeIndexDiff !== 0) return sizeIndexDiff;
      return a.project_type.localeCompare(b.project_type);
    });

  if (groups.length === 0) return null;

  // Summary stats
  const deviationCounts = { under: 0, normal: 0, over: 0, critical: 0 };
  for (const g of groups) {
    for (const e of g.entries) {
      deviationCounts[
        getDeviationLevel(e.totalHours, g.expectedMin, g.expectedMax)
      ]++;
    }
  }
  const totalEntries = Object.values(deviationCounts).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          Comparativa por Complejidad y Tipo Proyecto
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Análisis de los tiempos de QA comparados con las horas esperadas según
          la complejidad de la tarea, agrupados por complejidad y tipo de
          proyecto sin importar el periodo.
        </p>
      </div>

      {/* Resumen general */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">
            {deviationCounts.under}
          </p>
          <p className="text-xs text-blue-600">Bajo esperado</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">
            {deviationCounts.normal}
          </p>
          <p className="text-xs text-green-600">Normal</p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">
            {deviationCounts.over}
          </p>
          <p className="text-xs text-yellow-600">Sobre esperado</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-700">
            {deviationCounts.critical}
          </p>
          <p className="text-xs text-red-600">Exceso significativo</p>
        </div>
      </div>

      {/* Barra visual resumen */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">
          Distribución de desviaciones ({totalEntries} registros)
        </p>
        <div className="flex h-4 w-full rounded-full overflow-hidden bg-gray-100">
          {totalEntries > 0 && (
            <>
              <div
                style={{
                  width: `${(deviationCounts.under / totalEntries) * 100}%`,
                }}
                className="bg-blue-400 cursor-pointer hover:opacity-80 transition-opacity"
                onMouseEnter={(e) =>
                  handleBarTooltipShow(
                    e,
                    `Bajo esperado: ${deviationCounts.under} registros`,
                  )
                }
                onMouseLeave={handleBarTooltipHide}
              />
              <div
                style={{
                  width: `${(deviationCounts.normal / totalEntries) * 100}%`,
                }}
                className="bg-green-400 cursor-pointer hover:opacity-80 transition-opacity"
                onMouseEnter={(e) =>
                  handleBarTooltipShow(
                    e,
                    `Normal: ${deviationCounts.normal} registros`,
                  )
                }
                onMouseLeave={handleBarTooltipHide}
              />
              <div
                style={{
                  width: `${(deviationCounts.over / totalEntries) * 100}%`,
                }}
                className="bg-yellow-400 cursor-pointer hover:opacity-80 transition-opacity"
                onMouseEnter={(e) =>
                  handleBarTooltipShow(
                    e,
                    `Sobre esperado: ${deviationCounts.over} registros`,
                  )
                }
                onMouseLeave={handleBarTooltipHide}
              />
              <div
                style={{
                  width: `${(deviationCounts.critical / totalEntries) * 100}%`,
                }}
                className="bg-red-400 cursor-pointer hover:opacity-80 transition-opacity"
                onMouseEnter={(e) =>
                  handleBarTooltipShow(
                    e,
                    `Exceso significativo: ${deviationCounts.critical} registros`,
                  )
                }
                onMouseLeave={handleBarTooltipHide}
              />
            </>
          )}
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>Bajo esperado</span>
          <span>Normal</span>
          <span>Sobre esperado</span>
          <span>Exceso significativo</span>
        </div>
      </div>

      {/* Grupos por complejidad + Tipo Proyecto */}
      {groups.map((group) => {
        const groupKey = `${group.tshirtSize}|${group.project_type}`;
        const isExpanded = expandedGroup === groupKey;
        const groupDevLevel = getDeviationLevel(
          group.avgHours,
          group.expectedMin,
          group.expectedMax,
        );
        const groupBadge = getDeviationBadge(groupDevLevel);

        // Agrupamos por QA para las variaciones entre QAs
        const byQA = new Map<
          string,
          { totalHours: number; count: number; tasks: string[] }
        >();
        for (const e of group.entries) {
          if (!byQA.has(e.qaName))
            byQA.set(e.qaName, { totalHours: 0, count: 0, tasks: [] });
          const q = byQA.get(e.qaName)!;
          q.totalHours += e.totalHours;
          q.count += 1;
          q.tasks.push(e.taskName);
        }

        const qaList = Array.from(byQA.entries())
          .map(([name, data]) => ({
            name,
            avgHours: data.totalHours / data.count,
            count: data.count,
            totalHours: data.totalHours,
          }))
          .sort((a, b) => a.avgHours - b.avgHours);

        // Calculate spread (variación entre QAs)
        const spread =
          qaList.length > 1
            ? qaList[qaList.length - 1].avgHours - qaList[0].avgHours
            : 0;
        const hasSignificantSpread = spread > group.expectedMax * 0.5;

        return (
          <div
            key={groupKey}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          >
            <button
              onClick={() => setExpandedGroup(isExpanded ? null : groupKey)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-sm font-bold text-indigo-700">
                  {group.tshirtSize}
                </span>
                <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-sm font-medium text-purple-700">
                  {group.project_type}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${groupBadge.cls}`}
                >
                  {groupBadge.label}
                </span>
                {hasSignificantSpread && (
                  <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    ⚠ Alta variación entre QAs
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">
                    {group.entries.length}
                  </span>{" "}
                  registros ·{" "}
                  <span className="font-semibold text-gray-700">
                    {formatTime(group.avgHours)}
                  </span>{" "}
                  promedio · Esperado: {group.expectedMin}-{group.expectedMax}h
                </div>
                <span
                  className={`text-gray-400 text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-gray-200 p-4 space-y-4">
                {/* Barra visual de promedios por QA vs esperado */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-3">
                    Horas promedio por QA vs rango esperado
                  </p>
                  <div className="space-y-2">
                    {qaList.map((qa) => {
                      const maxBar = Math.max(
                        group.expectedMax * 2,
                        qa.avgHours * 1.2,
                      );
                      const devLevel = getDeviationLevel(
                        qa.avgHours,
                        group.expectedMin,
                        group.expectedMax,
                      );
                      const barColor =
                        devLevel === "normal"
                          ? "bg-green-500"
                          : devLevel === "under"
                            ? "bg-blue-500"
                            : devLevel === "over"
                              ? "bg-yellow-500"
                              : "bg-red-500";

                      return (
                        <div key={qa.name} className="flex items-center gap-3">
                          <span
                            className="text-xs font-medium text-gray-700 w-32 truncate"
                            title={qa.name}
                          >
                            {qa.name}
                          </span>
                          <div
                            className="flex-1 relative cursor-pointer"
                            onMouseEnter={(e) =>
                              handleBarTooltipShow(
                                e,
                                `${qa.name}: ${formatTime(qa.avgHours)} promedio · ${qa.count} tarea${qa.count !== 1 ? "s" : ""} · Esperado: ${group.expectedMin}-${group.expectedMax}h`,
                              )
                            }
                            onMouseLeave={handleBarTooltipHide}
                          >
                            {/* Expected range background */}
                            <div
                              className="absolute top-0 h-5 bg-green-100 border-l-2 border-r-2 border-green-300 rounded-sm opacity-50"
                              style={{
                                left: `${(group.expectedMin / maxBar) * 100}%`,
                                width: `${((group.expectedMax - group.expectedMin) / maxBar) * 100}%`,
                              }}
                            />
                            {/* Bar */}
                            <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColor} transition-all`}
                                style={{
                                  width: `${Math.min((qa.avgHours / maxBar) * 100, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-gray-700 w-20 text-right">
                            {formatTime(qa.avgHours)} ({qa.count})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded-sm" />{" "}
                    Rango esperado ({group.expectedMin}-{group.expectedMax}h)
                  </div>
                </div>

                {/* Insight narrativo */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    📊 Análisis
                  </p>
                  <div className="text-sm text-gray-600 space-y-2">
                    {group.entries.length === 1 ? (
                      <p>
                        Solo hay 1 registro para tareas{" "}
                        <strong>{group.tshirtSize}</strong> de tipo de proyecto{" "}
                        <strong>{group.project_type}</strong>. Se necesitan más
                        datos para una comparación significativa.
                      </p>
                    ) : (
                      <>
                        <p>
                          En tareas de complejidad{" "}
                          <strong>{group.tshirtSize}</strong> y tipo de proyecto{" "}
                          <strong>{group.project_type}</strong>, el promedio
                          general es{" "}
                          <strong>{formatTime(group.avgHours)}</strong>{" "}
                          (esperado: {group.expectedMin}-{group.expectedMax}h).
                        </p>
                        {hasSignificantSpread ? (
                          <p>
                            Existe una{" "}
                            <strong className="text-orange-700">
                              variación significativa
                            </strong>{" "}
                            de {formatTime(spread)} entre el QA más rápido (
                            {qaList[0].name}: {formatTime(qaList[0].avgHours)})
                            y el más lento ({qaList[qaList.length - 1].name}:{" "}
                            {formatTime(qaList[qaList.length - 1].avgHours)}).
                            Esto podría indicar diferencias en complejidad de
                            tareas, experiencia del QA, o la calidad de los
                            entregables del desarrollo.
                          </p>
                        ) : (
                          <p>
                            Los tiempos de los QAs son{" "}
                            <strong className="text-green-700">
                              consistentes
                            </strong>{" "}
                            entre sí
                            {spread > 0
                              ? ` (variación de ${formatTime(spread)})`
                              : ""}
                            , lo cual sugiere un buen estándar en el equipo para
                            este tipo de tarea.
                          </p>
                        )}
                        {groupDevLevel === "over" ||
                        groupDevLevel === "critical" ? (
                          <p>
                            ⚠️ El promedio general{" "}
                            <strong className="text-red-700">
                              excede las horas esperadas
                            </strong>{" "}
                            para complejidad {group.tshirtSize}. Considerar si
                            la complejidad asignada es correcta o si hay
                            factores que incrementan el tiempo de QA.
                          </p>
                        ) : groupDevLevel === "under" ? (
                          <p>
                            ✅ El equipo está completando estas tareas{" "}
                            <strong className="text-blue-700">
                              por debajo del tiempo estimado
                            </strong>
                            .
                          </p>
                        ) : (
                          <p>
                            ✅ Los tiempos están{" "}
                            <strong className="text-green-700">
                              dentro del rango esperado
                            </strong>
                            .
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Tabla de detalle */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th
                          className="text-left py-2 px-2 font-semibold text-gray-600"
                          title="Nombre del QA asignado a la tarea"
                        >
                          QA
                        </th>
                        <th
                          className="text-left py-2 px-2 font-semibold text-gray-600"
                          title="Nombre de la tarea con enlace al ticket"
                        >
                          Tarea
                        </th>
                        {activeCategories.map((cat) => (
                          <th
                            key={cat.id}
                            className="text-center py-2 px-2 font-semibold text-gray-600"
                            title={cat.name}
                          >
                            {cat.name}
                          </th>
                        ))}
                        <th
                          className="text-center py-2 px-2 font-semibold text-gray-600"
                          title="Total de horas invertidas por el QA en esta tarea"
                        >
                          Total
                        </th>
                        <th
                          className="text-center py-2 px-2 font-semibold text-gray-600"
                          title="Desviación respecto al rango esperado para esta complejidad"
                        >
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries
                        .sort(
                          (a, b) =>
                            a.qaName.localeCompare(b.qaName) ||
                            a.totalHours - b.totalHours,
                        )
                        .map((entry, i) => {
                          const devLevel = getDeviationLevel(
                            entry.totalHours,
                            group.expectedMin,
                            group.expectedMax,
                          );
                          const badge = getDeviationBadge(devLevel);
                          return (
                            <tr
                              key={`${entry.qaName}-${entry.taskId}-${i}`}
                              className={
                                i % 2 === 0 ? "bg-gray-50" : "bg-white"
                              }
                            >
                              <td className="py-1.5 px-2 font-medium text-gray-700">
                                {entry.qaName}
                              </td>
                              <td className="py-1.5 px-2">
                                {entry.taskLink ? (
                                  <a
                                    href={entry.taskLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                  >
                                    {entry.taskName}
                                  </a>
                                ) : (
                                  <span className="text-gray-600">
                                    {entry.taskName}
                                  </span>
                                )}
                              </td>
                              {activeCategories.map((cat) => (
                                <td
                                  key={cat.id}
                                  className="py-1.5 px-2 text-center font-medium"
                                  style={{ color: cat.hex_color }}
                                >
                                  {formatTime(Number(
                                    entry.hours_by_category?.[cat.id] ?? 0,
                                  ))}
                                </td>
                              ))}
                              <td className="py-1.5 px-2 text-center font-bold text-gray-800">
                                {formatTime(Number(entry.totalHours))}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <span
                                  className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-semibold ${badge.cls}`}
                                >
                                  {badge.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Tooltip flotante para barras - mantener siempre en DOM para evitar jank */}
      <div
        className="fixed bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none z-50 max-w-xs transition-opacity duration-100"
        style={{
          left: `${barTooltip.x}px`,
          top: `${barTooltip.y}px`,
          transform: "translate(-50%, -100%)",
          opacity: barTooltip.visible ? 1 : 0,
          visibility: barTooltip.visible ? "visible" : "hidden",
          willChange: "opacity, visibility",
        }}
      >
        {barTooltip.content}
        <div
          className="absolute w-2 h-2 bg-gray-900"
          style={{
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }}
        />
      </div>
    </div>
  );
}
