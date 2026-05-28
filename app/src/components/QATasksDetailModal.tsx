"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, Clock } from "lucide-react";
import Modal from "@/components/Modal";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";

interface QATask {
  id: string;
  name: string;
  task_link: string;
  status: string;
  tshirt_size: string | null;
  effort_score_date: string;
  real_qa_hours: number;
  expected_min_hours: number | null;
  expected_max_hours: number | null;
}

function fmtHours(h: number): string {
  if (h === 0) return "0h";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

interface QATasksDetailModalProps {
  isOpen: boolean;
  qaName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return format(d, "dd/MM/yyyy", { locale: es });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completada:
      "bg-emerald-950/40 text-emerald-400 border border-emerald-500/25",
    Deprecada: "bg-red-950/40 text-red-400 border border-red-500/25",
    Pendiente: "bg-yellow-950/40 text-yellow-400 border border-yellow-500/25",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status] ?? "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-t border-gray-100">
          <td className="px-3 py-3">
            <div className="h-4 bg-gray-200 rounded w-4" />
          </td>
          <td className="px-3 py-3">
            <div className="h-4 bg-gray-200 rounded w-52" />
          </td>
          <td className="px-3 py-3">
            <div className="h-5 bg-gray-200 rounded-full w-20" />
          </td>
          <td className="px-3 py-3">
            <div className="h-5 bg-gray-200 rounded-full w-12 mx-auto" />
          </td>
          <td className="px-3 py-3">
            <div className="h-4 bg-gray-200 rounded w-16 mx-auto" />
          </td>
          <td className="px-3 py-3">
            <div className="h-4 bg-gray-200 rounded w-12 mx-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

export default function QATasksDetailModal({
  isOpen,
  qaName,
  startDate,
  endDate,
  onClose,
}: QATasksDetailModalProps) {
  const [tasks, setTasks] = useState<QATask[]>([]);
  // Inicia en true para mostrar skeleton desde el primer render del modal
  const [loading, setLoading] = useState(true);
  const { safeFetch } = useSafeAuthFetch();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !qaName) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const load = async () => {
      setLoading(true);
      setTasks([]);
      try {
        const params = new URLSearchParams({
          qa_name: qaName,
          start_date: startDate,
          end_date: endDate,
        });
        const res = await safeFetch(`/api/qa-evaluations/tasks?${params}`, {
          signal: abortController.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ?? `Error ${res.status}`,
          );
        }
        const data: QATask[] = await res.json();
        setTasks(data);
        setLoading(false);
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "AbortError" ||
            err.message === "The operation was aborted.")
        )
          return; // Skeleton persiste hasta el fetch real (React StrictMode)
        console.error("Error cargando tareas QA:", err);
        setLoading(false);
      }
    };

    load();

    return () => {
      abortController.abort();
      abortRef.current = null;
    };
  }, [isOpen, qaName, startDate, endDate, safeFetch]);

  const handleClose = () => {
    setTasks([]);
    onClose();
  };

  const periodLabel = `${formatDate(startDate)} – ${formatDate(endDate)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title="Detalle de Tareas QA"
    >
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold">{qaName}</h2>
          <p className="text-sm text-gray-500 mt-0.5">Periodo: {periodLabel}</p>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-2.5 text-left font-semibold text-gray-700 w-8">
                  N°
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                  Tarea
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                  Talla
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                  T. esperado
                </th>
                <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">
                  T. real QA
                </th>
                <th className="px-3 py-2.5 text-left font-semibold text-gray-700 whitespace-nowrap">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <SkeletonRows />
              ) : tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-gray-500"
                  >
                    No hay tareas asignadas en este periodo.
                  </td>
                </tr>
              ) : (
                tasks.map((task, idx) => {
                  const hasRealHours = task.real_qa_hours > 0;
                  const withinOrBelow =
                    hasRealHours &&
                    task.expected_max_hours !== null &&
                    task.real_qa_hours <= task.expected_max_hours;
                  const overRange =
                    hasRealHours &&
                    task.expected_max_hours !== null &&
                    task.real_qa_hours > task.expected_max_hours;
                  return (
                    <tr
                      key={task.id}
                      className={`transition-colors ${
                        !hasRealHours
                          ? "bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/30"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      <td
                        className={`px-3 py-2.5 ${
                          !hasRealHours
                            ? "text-gray-400 dark:text-gray-500"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={task.task_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`hover:underline inline-flex items-center gap-1 font-medium ${
                              !hasRealHours
                                ? "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                                : "text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                            }`}
                          >
                            {task.name}
                            <ExternalLink
                              size={12}
                              className="shrink-0 opacity-60"
                            />
                          </a>
                          {!hasRealHours && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700/40 whitespace-nowrap">
                              <Clock size={10} />
                              Sin tiempos
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Talla */}
                      <td className="px-3 py-2.5 text-center">
                        {task.tshirt_size ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono border ${
                              !hasRealHours
                                ? "bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700"
                                : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                            }`}
                          >
                            {task.tshirt_size}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      {/* Tiempo esperado */}
                      <td
                        className={`px-3 py-2.5 text-center text-xs whitespace-nowrap ${
                          !hasRealHours
                            ? "text-gray-400 dark:text-gray-600"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {task.expected_min_hours !== null &&
                        task.expected_max_hours !== null ? (
                          `${fmtHours(task.expected_min_hours)} – ${fmtHours(task.expected_max_hours)}`
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">
                            —
                          </span>
                        )}
                      </td>
                      {/* Tiempo real QA */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {!hasRealHours ? (
                          <span className="text-xs text-amber-600 dark:text-amber-500/70 italic">
                            No registrado
                          </span>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              withinOrBelow
                                ? "text-emerald-600 dark:text-emerald-400"
                                : overRange
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {fmtHours(task.real_qa_hours)}
                          </span>
                        )}
                      </td>
                      {/* Estado */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={task.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Resumen */}
        {!loading &&
          tasks.length > 0 &&
          (() => {
            const total = tasks.length;
            const withTimings = tasks.filter((t) => t.real_qa_hours > 0).length;
            const withoutTimings = total - withTimings;
            const completed = tasks.filter(
              (t) => t.status === "Completada",
            ).length;
            const withinEstimate = tasks.filter(
              (t) =>
                t.real_qa_hours > 0 &&
                t.expected_max_hours !== null &&
                t.real_qa_hours <= t.expected_max_hours,
            ).length;
            return (
              <div className="space-y-1.5 text-xs">
                {withoutTimings > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700/30 dark:text-amber-400">
                    <Clock size={12} className="shrink-0" />
                    <span>
                      <span className="font-semibold">{withoutTimings}</span>{" "}
                      tarea{withoutTimings !== 1 ? "s" : ""} sin tiempos
                      registrados — no se incluyen en el cálculo de
                      cumplimiento.
                    </span>
                  </div>
                )}
                <div className="space-y-1 text-gray-500 text-right">
                  <p>
                    <span className="font-semibold text-gray-700">
                      {completed} de {total}
                    </span>{" "}
                    tarea{total !== 1 ? "s" : ""}{" "}
                    {total !== 1 ? "fueron" : "fue"} completada
                    {total !== 1 ? "s" : ""} en el periodo.
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">
                      {withinEstimate} de {withTimings}
                    </span>{" "}
                    tarea{withTimings !== 1 ? "s" : ""} con tiempos cumplen con
                    la estimación de talla.
                  </p>
                </div>
              </div>
            );
          })()}
      </div>
    </Modal>
  );
}
