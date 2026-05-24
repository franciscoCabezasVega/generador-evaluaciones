"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Download, RefreshCw } from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { QAEvaluationRow } from "@/lib/types";
import { downloadQAReportPDF } from "@/lib/services/qaReportPdfService";

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatPeriod(startDate: string, endDate: string): string {
  const sd = new Date(startDate + "T12:00:00");
  const ed = new Date(endDate + "T12:00:00");
  return `${format(sd, "dd 'de' MMMM yyyy", { locale: es })} – ${format(ed, "dd 'de' MMMM yyyy", { locale: es })}`;
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function SkeletonCard() {
  return (
    <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 animate-pulse space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-5 bg-gray-200 rounded w-48" />
          <div className="h-3 bg-gray-200 rounded w-64" />
        </div>
        <div className="h-9 bg-gray-200 rounded w-36" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-200 rounded-lg h-14" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}

export default function QAReportSection() {
  const lastMonth = subMonths(new Date(), 1);
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: startOfMonth(lastMonth),
    endDate: endOfMonth(lastMonth),
  });
  const [rows, setRows] = useState<QAEvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { safeFetch } = useSafeAuthFetch();
  const abortRef = useRef<AbortController | null>(null);

  const startDate = toLocalDateString(dateRange.startDate);
  const endDate = toLocalDateString(dateRange.endDate);

  const fetchData = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setRows([]);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      const res = await safeFetch(`/api/qa-evaluations?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: QAEvaluationRow[] = await res.json();
      setRows(data);
      setLoading(false);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message === "The operation was aborted.")
      )
        return;
      console.error("Error cargando reporte QA:", err);
      setLoading(false);
    }
  }, [startDate, endDate, safeFetch]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      downloadQAReportPDF(rows, startDate, endDate);
    } finally {
      setDownloading(false);
    }
  };

  // Métricas resumen
  const withEval = rows.filter(
    (r) => r.excelencia !== null || r.soft_skills !== null,
  ).length;
  const excelVals = rows
    .filter((r) => r.excelencia !== null)
    .map((r) => r.excelencia as number);
  const ssVals = rows
    .filter((r) => r.soft_skills !== null)
    .map((r) => r.soft_skills as number);
  const avgEx =
    excelVals.length > 0
      ? (excelVals.reduce((a, b) => a + b, 0) / excelVals.length).toFixed(2)
      : null;
  const avgSs =
    ssVals.length > 0
      ? (ssVals.reduce((a, b) => a + b, 0) / ssVals.length).toFixed(2)
      : null;

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="bg-gray-100 border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Rango de fechas
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Card de reporte */}
      {loading ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-10 text-center text-gray-500 text-sm">
          No hay datos de evaluación para el periodo seleccionado.
        </div>
      ) : (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 card-glow">
          {/* Card header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Evaluación de Equipo QA
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {formatPeriod(startDate, endDate)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="flex items-center gap-2 shrink-0"
            >
              <Download size={14} />
              {downloading ? "Generando…" : "Descargar PDF"}
            </Button>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total miembros", value: rows.length },
              { label: "Con evaluación", value: withEval },
              {
                label: "Prom. Excelencia",
                value: avgEx ?? "—",
                sub: "sobre 5",
              },
              {
                label: "Prom. Soft Skills",
                value: avgSs ?? "—",
                sub: "sobre 5",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-gray-200/60 border border-gray-300/50 rounded-lg px-3 py-2.5 text-center"
              >
                <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900 num">
                  {stat.value}
                </p>
                {stat.sub && (
                  <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
                )}
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-lg border border-gray-300/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-200/70 border-b border-gray-300/60">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-700 w-8">
                    N°
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                    Nombre
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                    Tasa aceptación
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                    Cumplimiento
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                    Excelencia
                    <span className="block text-xs font-normal text-gray-400">
                      (0 – 5)
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                    Soft Skills
                    <span className="block text-xs font-normal text-gray-400">
                      (0 – 5)
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                    Comentarios
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/60">
                {rows.map((row, idx) => (
                  <tr
                    key={row.qa_id}
                    className={`transition-colors ${idx % 2 === 0 ? "bg-transparent" : "bg-gray-200/30"} hover:bg-gray-200/50`}
                  >
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">
                      {row.qa_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block bg-gray-200 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-semibold num">
                        {row.tasa_aceptacion != null
                          ? row.tasa_aceptacion % 1 === 0
                            ? row.tasa_aceptacion.toFixed(0)
                            : row.tasa_aceptacion
                          : 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block bg-gray-200 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-semibold num">
                        {row.cumplimiento != null
                          ? row.cumplimiento % 1 === 0
                            ? row.cumplimiento.toFixed(0)
                            : row.cumplimiento
                          : 0}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.excelencia !== null &&
                      row.excelencia !== undefined ? (
                        <span className="inline-block bg-blue-950/40 text-blue-400 border border-blue-500/25 rounded px-2.5 py-0.5 text-sm font-bold num">
                          {fmtScore(row.excelencia)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.soft_skills !== null &&
                      row.soft_skills !== undefined ? (
                        <span className="inline-block bg-purple-950/40 text-purple-400 border border-purple-500/25 rounded px-2.5 py-0.5 text-sm font-bold num">
                          {fmtScore(row.soft_skills)}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 max-w-xs">
                      {row.comentarios ? (
                        <span className="line-clamp-2">{row.comentarios}</span>
                      ) : (
                        <span className="text-gray-400 italic">
                          Sin comentarios
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pie */}
          <p className="text-xs text-gray-400 mt-3 text-right">
            {rows.length} miembro{rows.length !== 1 ? "s" : ""} · {withEval}{" "}
            evaluado{withEval !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
