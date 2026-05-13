"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { getSessionViaManager } from "@/lib/fetchAuth";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Report, TaskSquadReportEntry } from "@/lib/types";

export default function ReportDetailPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;
  const { safeFetch } = useSafeAuthFetch();
  const loadReportAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
        error,
      } = await getSessionViaManager();
      if (error || !session) {
        router.push("/auth/login");
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await safeFetch(`/api/reports/${reportId}`, {
          signal: loadReportAbortRef.current?.signal,
        });
        if (!response.ok) throw new Error("Error al cargar reporte");
        const data = await response.json();
        setReport(data);
      } catch (error: unknown) {
        // Ignorar errores de AbortError (cuando se navega away)
        if (error instanceof Error && error.name === "AbortError") {
          // Report loading aborted - component unmounted
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";
        alert(`Error: ${errorMessage}`);
        router.push("/reports");
      } finally {
        setLoading(false);
      }
    };

    if (!reportId) return;

    const abortController = new AbortController();
    loadReportAbortRef.current = abortController;

    loadReport();

    return () => {
      abortController.abort();
      loadReportAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const sortSquadsByNumber = (squads: string[]) => {
    return [...squads].sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">Cargando reporte...</div>
        </main>
      </>
    );
  }

  if (!report) {
    return (
      <>
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-red-600">Reporte no encontrado</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Producto: {report.squad}</h1>
            <p className="text-gray-600 mt-2">
              {report.month}/{report.year} - Versión {report.version}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push("/reports")}>
              ← Volver
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Tareas por Squad */}
          {report.report_data?.tasksBySquad && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-6">Tareas por Squad</h2>
              {sortSquadsByNumber(
                Object.keys(report.report_data.tasksBySquad),
              ).map((squad) => {
                const tasks = report.report_data.tasksBySquad[squad];
                const squadScore =
                  report.report_data.squadsScores?.[squad] || 0;
                const performanceComments =
                  typeof report.performance_comment === "string"
                    ? JSON.parse(report.performance_comment)
                    : {};
                const communicationComments =
                  typeof report.communication_comment === "string"
                    ? JSON.parse(report.communication_comment)
                    : {};

                return (
                  <div key={squad} className="mb-12">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {squad}
                      </h3>
                      <div className="text-2xl font-bold text-blue-600">
                        Nota Final:{" "}
                        {squadScore.toLocaleString("es-ES", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 1,
                        })}
                        /10
                      </div>
                    </div>

                    {tasks.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-6 mb-6">
                        <p className="text-yellow-800 font-medium">
                          Este equipo no tuvo tareas asignadas en este período.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded border overflow-x-auto mb-6">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 border-b">
                            <tr>
                              <th className="px-3 py-2 text-left w-12">
                                N° Item
                              </th>
                              <th className="px-3 py-2 text-left w-48">
                                Nombre
                              </th>
                              <th className="px-3 py-2 text-left w-40">Link</th>
                              <th className="px-3 py-2 text-center">
                                Devoluciones Bajas
                              </th>
                              <th className="px-3 py-2 text-center">
                                Devoluciones Medias
                              </th>
                              <th className="px-3 py-2 text-center">
                                Devoluciones Graves
                              </th>
                              <th className="px-3 py-2 text-center">Nota</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.map(
                              (task: TaskSquadReportEntry, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-b hover:bg-gray-50"
                                >
                                  <td className="px-3 py-2">{idx + 1}</td>
                                  <td className="px-3 py-2 w-48 break-words font-medium">
                                    {task.name}
                                  </td>
                                  <td className="px-3 py-2 w-40 break-words">
                                    {task.task_link ? (
                                      <a
                                        href={task.task_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline break-all"
                                      >
                                        {task.task_link}
                                      </a>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {task.low_returns || 0}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {task.medium_returns || 0}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    {task.high_returns || 0}
                                  </td>
                                  <td className="px-3 py-2 text-center font-semibold">
                                    {task.calculated_score.toLocaleString(
                                      "es-ES",
                                      {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 1,
                                      },
                                    )}
                                    /10
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Comentarios por Squad */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      {performanceComments[squad] && (
                        <div className="bg-blue-50 p-4 rounded border border-blue-200">
                          <h4 className="font-semibold text-blue-900 mb-2">
                            Desempeño
                          </h4>
                          <p className="text-sm text-blue-800">
                            {performanceComments[squad]}
                          </p>
                        </div>
                      )}

                      {communicationComments[squad] && (
                        <div className="bg-green-50 p-4 rounded border border-green-200">
                          <h4 className="font-semibold text-green-900 mb-2">
                            Comunicación
                          </h4>
                          <p className="text-sm text-green-800">
                            {communicationComments[squad]}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tareas Deprecadas y Pendientes */}
          {report.report_data?.deprecatedPendingBySquad &&
            Object.values(report.report_data.deprecatedPendingBySquad).some(
              (tasks: unknown) => Array.isArray(tasks) && tasks.length > 0,
            ) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-6">
                  Tareas Deprecadas y Pendientes
                </h2>

                {sortSquadsByNumber(
                  Object.keys(
                    report.report_data.deprecatedPendingBySquad ?? {},
                  ),
                ).map((squad) => {
                  const tasks =
                    report.report_data.deprecatedPendingBySquad?.[squad];
                  if (!tasks || tasks.length === 0) return null;

                  return (
                    <div key={squad} className="mb-8">
                      <h3 className="font-semibold text-gray-800 mb-4">
                        {squad}
                      </h3>
                      <div className="bg-gray-50 rounded border overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead className="bg-gray-100 border-b">
                            <tr>
                              <th className="px-3 py-2 text-left border-r w-12">
                                N° Item
                              </th>
                              <th className="px-3 py-2 text-left border-r w-48">
                                Nombre
                              </th>
                              <th className="px-3 py-2 text-left border-r w-40">
                                Link
                              </th>
                              <th className="px-3 py-2 text-left w-24">
                                Estado
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.map(
                              (task: TaskSquadReportEntry, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-b hover:bg-gray-50"
                                >
                                  <td className="px-3 py-2 border-r">
                                    {idx + 1}
                                  </td>
                                  <td className="px-3 py-2 border-r w-48 break-words font-medium">
                                    {task.name}
                                  </td>
                                  <td className="px-3 py-2 border-r w-40 break-words">
                                    {task.task_link ? (
                                      <a
                                        href={task.task_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline break-all"
                                      >
                                        {task.task_link}
                                      </a>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span
                                      className={`px-2 py-1 rounded text-xs font-semibold inline-block ${
                                        task.status === "Deprecada"
                                          ? "bg-red-100 text-red-800"
                                          : "bg-yellow-100 text-yellow-800"
                                      }`}
                                    >
                                      {task.status}
                                    </span>
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => router.push("/reports")}
            className="px-6"
          >
            ← Volver a Reportes
          </Button>
        </div>
      </main>
    </>
  );
}
