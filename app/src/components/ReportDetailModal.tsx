"use client";

import { useState, useEffect, useRef } from "react";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import Modal from "@/components/Modal";
import { FileDown } from "lucide-react";
import { downloadFactoryReportPDF } from "@/lib/services/pdfService";
import { Report, TaskSquadReportEntry } from "@/lib/types";

interface ReportDetailModalProps {
  isOpen: boolean;
  reportId: string;
  onClose: () => void;
}

function SkeletonDetailContent() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2 pb-4 border-b">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      </div>

      {/* Squad section skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/4"></div>
          <div className="bg-gray-50 rounded border space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-20 bg-blue-100 rounded"></div>
            <div className="h-20 bg-green-100 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportDetailModal({
  isOpen,
  reportId,
  onClose,
}: ReportDetailModalProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { safeFetch } = useSafeAuthFetch();
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen || !reportId) {
      return;
    }

    const loadReport = async () => {
      try {
        setLoading(true);
        const response = await safeFetch(`/api/reports/${reportId}`, {
          signal: loadAbortRef.current?.signal,
        });

        if (!response.ok) {
          throw new Error("Error al cargar reporte");
        }

        const data = await response.json();
        setReport(data);
      } catch (error: unknown) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          console.error("Error cargando reporte:", error);
        }
      } finally {
        setLoading(false);
      }
    };

    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    loadReport();

    return () => {
      abortController.abort();
      loadAbortRef.current = null;
    };
  }, [isOpen, reportId, safeFetch]);

  const handleClose = () => {
    setReport(null);
    setLoading(false);
    onClose();
  };

  const handleDownloadPDF = async () => {
    if (!report) return;

    try {
      setDownloading(true);

      await downloadFactoryReportPDF(
        report.report_data,
        report.month,
        report.year,
        report.squad || "Fábrica",
        report.version,
        `Reporte-Fabrica-${report.squad}-${report.month}-${report.year}-v${report.version}.pdf`,
      );
    } catch (error) {
      console.error("Error descargando PDF:", error);
    } finally {
      setDownloading(false);
    }
  };

  const sortSquadsByNumber = (squads: string[]) => {
    return [...squads].sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0");
      const numB = parseInt(b.match(/\d+/)?.[0] || "0");
      return numA - numB;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      title="Detalle del Reporte"
      headerActions={
        report && (
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Descargar reporte en PDF"
            aria-label="Descargar PDF"
          >
            <FileDown className="w-5 h-5" />
          </button>
        )
      }
    >
      <div>
        {loading ? (
          <SkeletonDetailContent />
        ) : report ? (
          <div className="space-y-8">
            {/* Header */}
            <div>
              <h2 className="text-2xl font-bold">Producto: {report.squad}</h2>
              <p className="text-gray-600 text-sm mt-2">
                {report.month}/{report.year} - Versión {report.version}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Generado:{" "}
                {new Date(report.created_at).toLocaleDateString("es-ES")}
              </p>
            </div>

            {/* Tareas por Squad */}
            {report.report_data?.tasksBySquad && (
              <div>
                <h3 className="text-lg font-semibold mb-6">Tareas por Squad</h3>
                {sortSquadsByNumber(
                  Object.keys(report.report_data.tasksBySquad),
                ).map((squad) => {
                  const tasks = report.report_data.tasksBySquad[squad];
                  const squadScore =
                    report.report_data.squadsScores?.[squad] || 0;
                  const performanceComments = (() => {
                    if (typeof report.performance_comment !== "string")
                      return {};
                    try {
                      return JSON.parse(report.performance_comment);
                    } catch {
                      return {};
                    }
                  })();
                  const communicationComments = (() => {
                    if (typeof report.communication_comment !== "string")
                      return {};
                    try {
                      return JSON.parse(report.communication_comment);
                    } catch {
                      return {};
                    }
                  })();

                  return (
                    <div key={squad} className="mb-10">
                      <div className="flex justify-between items-center mb-4 pb-4 border-b">
                        <h4 className="text-base font-semibold text-gray-800">
                          {squad}
                        </h4>
                        <div className="text-xl font-bold text-blue-600">
                          Nota Final:{" "}
                          {squadScore.toLocaleString("es-ES", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 1,
                          })}
                          /10
                        </div>
                      </div>

                      {tasks.length === 0 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
                          <p className="text-yellow-800 text-sm font-medium">
                            Este equipo no tuvo tareas asignadas en este
                            período.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded border overflow-x-auto mb-6">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left w-12">N°</th>
                                <th className="px-3 py-2 text-left flex-1">
                                  Nombre
                                </th>
                                <th className="px-3 py-2 text-center">Bajas</th>
                                <th className="px-3 py-2 text-center">
                                  Medias
                                </th>
                                <th className="px-3 py-2 text-center">
                                  Graves
                                </th>
                                <th className="px-3 py-2 text-center">Nota</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tasks.map(
                                (task: TaskSquadReportEntry, idx: number) => (
                                  <tr
                                    key={idx}
                                    className="border-b hover:bg-gray-100 text-xs"
                                  >
                                    <td className="px-3 py-2">{idx + 1}</td>
                                    <td className="px-3 py-2 break-words">
                                      {task.task_link ? (
                                        <a
                                          href={task.task_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline hover:font-semibold transition-all"
                                        >
                                          {task.name}
                                        </a>
                                      ) : (
                                        task.name
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
                      <div className="grid grid-cols-1 gap-4 mb-8">
                        {performanceComments[squad] && (
                          <div className="bg-blue-50 p-4 rounded border border-blue-200">
                            <h5 className="font-semibold text-blue-900 mb-2 text-sm">
                              Desempeño
                            </h5>
                            <p className="text-xs text-blue-800 leading-relaxed">
                              {performanceComments[squad]}
                            </p>
                          </div>
                        )}

                        {communicationComments[squad] && (
                          <div className="bg-green-50 p-4 rounded border border-green-200">
                            <h5 className="font-semibold text-green-900 mb-2 text-sm">
                              Comunicación
                            </h5>
                            <p className="text-xs text-green-800 leading-relaxed">
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
                <div>
                  <h3 className="text-lg font-semibold mb-6">
                    Tareas Deprecadas y Pendientes
                  </h3>

                  {sortSquadsByNumber(
                    Object.keys(
                      report.report_data.deprecatedPendingBySquad ?? {},
                    ),
                  ).map((squad) => {
                    const tasks =
                      report.report_data.deprecatedPendingBySquad?.[squad];
                    if (!tasks || tasks.length === 0) return null;

                    return (
                      <div key={squad} className="mb-6">
                        <h4 className="font-semibold text-sm text-gray-800 mb-3">
                          {squad}
                        </h4>
                        <div className="bg-gray-50 rounded border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100 border-b">
                              <tr>
                                <th className="px-3 py-2 text-left w-12">N°</th>
                                <th className="px-3 py-2 text-left flex-1">
                                  Nombre
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
                                    className="border-b hover:bg-gray-100 text-xs"
                                  >
                                    <td className="px-3 py-2">{idx + 1}</td>
                                    <td className="px-3 py-2 break-words">
                                      {task.task_link ? (
                                        <a
                                          href={task.task_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline hover:font-semibold transition-all"
                                        >
                                          {task.name}
                                        </a>
                                      ) : (
                                        task.name
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
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
        ) : (
          <div className="text-center text-red-600 py-8">
            Reporte no encontrado
          </div>
        )}
      </div>
    </Modal>
  );
}
