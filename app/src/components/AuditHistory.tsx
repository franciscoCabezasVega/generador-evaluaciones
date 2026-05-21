"use client";

import React, { useState } from "react";
import { AuditLog, TaskSquad, AuditLogValues } from "@/lib/types";
import { detectSquadChanges, SquadChange } from "@/lib/squadChangeUtils";
import { formatScore } from "@/lib/scoreCalculator";
import Modal from "./Modal";

interface AuditHistoryProps {
  logs: AuditLog[];
  isLoading?: boolean;
}

// Componente para renderizar tabla de cambios en squads
const SquadChangesTable = ({ changes }: { changes: SquadChange[] }) => {
  if (changes.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">Sin cambios en equipos</div>
    );
  }

  return (
    <div className="space-y-3">
      {changes.map((change) => (
        <div
          key={change.squad}
          className="border rounded-lg overflow-hidden bg-gray-50"
        >
          {/* Squad Header */}
          <div className="px-4 py-2.5 font-semibold bg-gray-100 text-gray-800">
            {change.squad}
          </div>

          {/* Cambios */}
          <div className="divide-y divide-gray-200">
            {/* Bajas */}
            {change.low.old !== change.low.new && (
              <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                <span className="text-sm font-medium text-gray-700">
                  Bajas:
                </span>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-600 mb-1">Anterior</div>
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                    {change.low.old}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-gray-400 font-bold text-lg">→</div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.low.new}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Medias */}
            {change.medium.old !== change.medium.new && (
              <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                <span className="text-sm font-medium text-gray-700">
                  Medias:
                </span>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-600 mb-1">Anterior</div>
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                    {change.medium.old}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-gray-400 font-bold text-lg">→</div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.medium.new}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Graves */}
            {change.high.old !== change.high.new && (
              <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center">
                <span className="text-sm font-medium text-gray-700">
                  Graves:
                </span>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-600 mb-1">Anterior</div>
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                    {change.high.old}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-gray-400 font-bold text-lg">→</div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {change.high.new}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nota */}
            {change.score.old !== change.score.new && (
              <div className="px-4 py-3 grid grid-cols-3 gap-4 items-center bg-blue-50">
                <span className="text-sm font-bold text-blue-800">Nota:</span>
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-600 mb-1">Anterior</div>
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                    {formatScore(change.score.old)}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="text-gray-400 font-bold text-lg">→</div>
                  <div className="flex flex-col items-center flex-1">
                    <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded font-semibold text-sm w-full text-center">
                      {formatScore(change.score.new)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notas Adicionales */}
            {change.additional_notes.old !== change.additional_notes.new && (
              <div className="px-4 py-3 grid grid-cols-1 gap-4 items-start">
                <span className="text-sm font-medium text-gray-700">
                  Notas Adicionales:
                </span>
                <div className="flex gap-3 w-full">
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 mb-1">Anterior</div>
                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm w-full min-h-[60px] max-h-[100px] overflow-y-auto">
                      {change.additional_notes.old || (
                        <span className="italic text-gray-500">Sin notas</span>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-400 font-bold text-lg flex items-center">
                    →
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 mb-1">Nuevo</div>
                    <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm w-full min-h-[60px] max-h-[100px] overflow-y-auto">
                      {change.additional_notes.new || (
                        <span className="italic text-gray-500">Sin notas</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Componente principal
export default function AuditHistory({
  logs,
  isLoading = false,
}: AuditHistoryProps) {
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "CREATE":
        return "bg-green-100 text-green-800 border-green-300";
      case "UPDATE":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "DELETE":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-100 h-24 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No hay historial de cambios disponible
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {logs.map((log) => (
          <div
            key={log.id}
            onClick={() => setSelectedLog(log)}
            className={`border-l-4 rounded-lg p-4 ${getActionColor(log.action)} border cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-101 active:scale-99`}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-semibold">{log.action}</div>
                <div className="text-sm opacity-75">{log.user_email}</div>
              </div>
              <div className="text-xs opacity-75 text-right">
                <div>{formatDate(log.timestamp)}</div>
              </div>
            </div>

            {/* Entity Name */}
            <div className="text-sm font-semibold text-gray-700 mb-2">
              {log.entity_name}
            </div>
          </div>
        ))}
      </div>

      {/* Modal con detalles */}
      <Modal
        isOpen={selectedLog !== null}
        title={
          selectedLog?.action === "CREATE"
            ? "Nueva Tarea"
            : selectedLog?.action === "UPDATE"
              ? selectedLog?.entity_type === "TIMING"
                ? "Sincronización de Timing"
                : "Actualización de Tarea"
              : selectedLog?.action === "DELETE"
                ? "Eliminación de Tarea"
                : "Detalles"
        }
        onClose={() => setSelectedLog(null)}
      >
        {selectedLog && (
          <div className="w-full">
            {/* Información General */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-700 mb-3">
                Información General
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">
                    Fecha y Hora:
                  </span>
                  <div>{formatDate(selectedLog.timestamp)}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Usuario:</span>
                  <div>{selectedLog.user_email}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Acción:</span>
                  <div>{selectedLog.action}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Entidad:</span>
                  <div>{selectedLog.entity_type}</div>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Nombre:</span>
                  <div>{selectedLog.entity_name}</div>
                </div>
              </div>
            </div>

            {/* Detalles de Creación (CREATE) */}
            {selectedLog.action === "CREATE" && (
              <div className="mb-6 p-4 bg-card rounded-lg border">
                <h3 className="font-semibold text-gray-700 mb-4">
                  Detalles de Crear
                </h3>

                {/* Información de la Tarea */}
                <div className="mb-4 p-3 bg-green-50 rounded border border-green-200">
                  <h4 className="text-sm font-semibold text-green-900 mb-3">
                    Información de la Tarea
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedLog.new_values && (
                      <>
                        {Object.entries(selectedLog.new_values).map(
                          ([key, value]: [string, unknown]) => {
                            // Ignorar estos campos
                            if (
                              [
                                "squads",
                                "additional_notes",
                                "id",
                                "user_id",
                                "created_at",
                                "updated_at",
                              ].includes(key)
                            ) {
                              return null;
                            }

                            return (
                              <div key={key}>
                                <span className="font-semibold text-green-800 capitalize">
                                  {key.replace(/_/g, " ")}:
                                </span>
                                <div className="text-green-700">
                                  {String(value) || (
                                    <span className="italic">Sin valor</span>
                                  )}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </>
                    )}
                  </div>
                </div>

                {(selectedLog.new_values as AuditLogValues | undefined)?.squads
                  ?.length &&
                  (selectedLog.new_values as AuditLogValues).squads!.length >
                    0 && (
                    <div className="p-3 bg-blue-50 rounded border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">
                        Equipos
                      </h4>
                      <div className="space-y-3">
                        {(
                          (selectedLog.new_values as AuditLogValues)
                            .squads as Partial<TaskSquad>[]
                        ).map((squad: Partial<TaskSquad>, idx: number) => (
                          <div
                            key={idx}
                            className="bg-card border border-blue-200 dark:border-blue-800 rounded p-3"
                          >
                            <div className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                              {squad.squad}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Bajas:
                                </span>
                                <div>{squad.low_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Medias:
                                </span>
                                <div>{squad.medium_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Graves:
                                </span>
                                <div>{squad.high_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Nota:
                                </span>
                                <div className="font-bold text-blue-700">
                                  {formatScore(squad.calculated_score ?? 0)}/10
                                </div>
                              </div>
                            </div>
                            {squad.additional_notes && (
                              <div className="pt-2 border-t border-blue-200">
                                <div className="text-xs font-semibold text-gray-600 mb-1">
                                  Notas Adicionales:
                                </div>
                                <div className="text-xs text-gray-700 bg-muted rounded p-2 max-h-20 overflow-y-auto">
                                  {squad.additional_notes}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {Array.isArray(
                  (selectedLog.new_values as AuditLogValues | undefined)
                    ?.assigned_qa,
                ) &&
                  (
                    (selectedLog.new_values as AuditLogValues)
                      .assigned_qa as string[]
                  ).length > 0 && (
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <h4 className="text-sm font-semibold text-purple-900 mb-3">
                        QA Asignados
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          (selectedLog.new_values as AuditLogValues)
                            .assigned_qa as string[]
                        ).map((qa: string) => (
                          <span
                            key={qa}
                            className="inline-block bg-card border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          >
                            {qa}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {selectedLog.action === "DELETE" && (
              <div className="mb-6 p-4 bg-card rounded-lg border">
                <h3 className="font-semibold text-gray-700 mb-4">
                  Información Eliminada
                </h3>
                <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
                  <h4 className="text-sm font-semibold text-red-900 mb-3">
                    Información de la Tarea
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedLog.old_values && (
                      <>
                        {Object.entries(selectedLog.old_values).map(
                          ([key, value]: [string, unknown]) => {
                            // Ignorar estos campos
                            if (
                              [
                                "squads",
                                "additional_notes",
                                "id",
                                "user_id",
                                "created_at",
                                "updated_at",
                              ].includes(key)
                            ) {
                              return null;
                            }

                            return (
                              <div key={key}>
                                <span className="font-semibold text-red-800 capitalize">
                                  {key.replace(/_/g, " ")}:
                                </span>
                                <div className="text-red-700">
                                  {String(value) || (
                                    <span className="italic">Sin valor</span>
                                  )}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </>
                    )}
                  </div>
                </div>

                {(selectedLog.old_values as AuditLogValues | undefined)?.squads
                  ?.length &&
                  (selectedLog.old_values as AuditLogValues).squads!.length >
                    0 && (
                    <div className="p-3 bg-red-50 rounded border border-red-200">
                      <h4 className="text-sm font-semibold text-red-900 mb-3">
                        Equipos
                      </h4>
                      <div className="space-y-3">
                        {(
                          (selectedLog.old_values as AuditLogValues)
                            .squads as Partial<TaskSquad>[]
                        ).map((squad: Partial<TaskSquad>, idx: number) => (
                          <div
                            key={idx}
                            className="bg-card border border-red-200 dark:border-red-800 rounded p-3"
                          >
                            <div className="font-semibold text-red-800 dark:text-red-300 mb-2">
                              {squad.squad}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Bajas:
                                </span>
                                <div>{squad.low_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Medias:
                                </span>
                                <div>{squad.medium_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Graves:
                                </span>
                                <div>{squad.high_returns}</div>
                              </div>
                              <div>
                                <span className="font-semibold text-gray-600">
                                  Nota:
                                </span>
                                <div className="font-bold text-red-700">
                                  {formatScore(squad.calculated_score ?? 0)}/10
                                </div>
                              </div>
                            </div>
                            {squad.additional_notes && (
                              <div className="pt-2 border-t border-red-200">
                                <div className="text-xs font-semibold text-gray-600 mb-1">
                                  Notas Adicionales:
                                </div>
                                <div className="text-xs text-gray-700 bg-muted rounded p-2 max-h-20 overflow-y-auto">
                                  {squad.additional_notes}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {Array.isArray(
                  (selectedLog.old_values as AuditLogValues | undefined)
                    ?.assigned_qa,
                ) &&
                  (
                    (selectedLog.old_values as AuditLogValues)
                      .assigned_qa as string[]
                  ).length > 0 && (
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <h4 className="text-sm font-semibold text-purple-900 mb-3">
                        QA Asignados
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          (selectedLog.old_values as AuditLogValues)
                            .assigned_qa as string[]
                        ).map((qa: string) => (
                          <span
                            key={qa}
                            className="inline-block bg-card border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          >
                            {qa}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
            {/* Horas sincronizadas por ClickUp — solo para entidades TIMING */}
            {selectedLog.action === "UPDATE" &&
              selectedLog.entity_type === "TIMING" &&
              (() => {
                const extractH = (
                  v: unknown,
                ): Record<string, number> | null => {
                  if (!v || typeof v !== "object") return null;
                  const o = v as Record<string, unknown>;
                  // Formato legado: { category_hours: { slug: hours } }
                  if (
                    o.category_hours &&
                    typeof o.category_hours === "object"
                  ) {
                    const entries = Object.entries(
                      o.category_hours as Record<string, unknown>,
                    ).flatMap(([slug, raw]) => {
                      const h = Number(raw);
                      if (!Number.isFinite(h)) return [];
                      return [
                        [
                          slug
                            .replace(/_/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
                          h,
                        ],
                      ] as [[string, number]];
                    });
                    return entries.length > 0
                      ? Object.fromEntries(entries)
                      : null;
                  }
                  // Formato nuevo: { qa_entries: [{ qa_name, categories: [{category_name, hours}] }] }
                  if (Array.isArray(o.qa_entries)) {
                    const agg: Record<string, number> = {};
                    for (const e of o.qa_entries as Array<{
                      qa_name: string;
                      categories: Array<{
                        category_name: string;
                        hours: unknown;
                      }>;
                    }>) {
                      for (const cat of e.categories ?? []) {
                        const h = Number(cat.hours);
                        if (!Number.isFinite(h)) continue;
                        agg[cat.category_name] =
                          (agg[cat.category_name] ?? 0) + h;
                      }
                    }
                    return Object.keys(agg).length > 0 ? agg : null;
                  }
                  return null;
                };
                const newH = extractH(selectedLog.new_values);
                const oldH = extractH(selectedLog.old_values);
                if (!newH) return null;
                const cats = Array.from(
                  new Set([
                    ...Object.keys(newH),
                    ...(oldH ? Object.keys(oldH) : []),
                  ]),
                );
                return (
                  <div className="mb-6 p-4 bg-card rounded-lg border">
                    <h3 className="font-semibold text-gray-700 mb-3">
                      Horas registradas por ClickUp
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b border-gray-200">
                            <th className="text-left py-1.5 font-medium">
                              Categoría
                            </th>
                            {oldH && (
                              <th className="text-right py-1.5 font-medium">
                                Anterior
                              </th>
                            )}
                            <th className="text-right py-1.5 font-medium">
                              {oldH ? "Nuevo" : "Horas"}
                            </th>
                            {oldH && (
                              <th className="text-right py-1.5 font-medium">
                                Δ
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {cats.map((cat) => {
                            const nH = newH[cat] ?? 0;
                            const oH = oldH?.[cat] ?? 0;
                            const delta = nH - oH;
                            return (
                              <tr
                                key={cat}
                                className="border-b border-gray-100 last:border-0"
                              >
                                <td className="py-1.5 text-gray-700">{cat}</td>
                                {oldH && (
                                  <td className="py-1.5 text-right text-gray-500">
                                    {oH.toFixed(2)}h
                                  </td>
                                )}
                                <td className="py-1.5 text-right font-semibold text-gray-800">
                                  {nH.toFixed(2)}h
                                </td>
                                {oldH && (
                                  <td
                                    className={`py-1.5 text-right text-xs font-semibold ${
                                      delta > 0
                                        ? "text-green-600"
                                        : delta < 0
                                          ? "text-red-600"
                                          : "text-gray-400"
                                    }`}
                                  >
                                    {delta > 0 ? "+" : ""}
                                    {delta.toFixed(2)}h
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            {selectedLog.action === "UPDATE" &&
              selectedLog.entity_type !== "TIMING" && (
                <div className="mb-6 p-4 bg-card rounded-lg border">
                  <h3 className="font-semibold text-gray-700 mb-3">
                    Cambios en la Tarea
                  </h3>
                  {!selectedLog.changes ||
                  Object.keys(selectedLog.changes).filter(
                    (k) => k !== "squads" && k !== "assigned_qa",
                  ).length === 0 ? (
                    <div className="text-gray-500 italic text-sm">
                      Sin cambios en los campos de la tarea
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {Object.entries(selectedLog.changes).map(
                        ([key, change]: [string, unknown]) => {
                          // Ignorar squads y assigned_qa aquí (se manejan en otras secciones)
                          if (key === "squads" || key === "assigned_qa")
                            return null;

                          // Ignorar campos de devoluciones (están en squads)
                          const fieldsToIgnore = [
                            "calculated_score",
                            "low_returns",
                            "medium_returns",
                            "high_returns",
                          ];
                          if (fieldsToIgnore.includes(key)) return null;

                          const typedChange = change as {
                            old: unknown;
                            new: unknown;
                          };
                          return (
                            <div
                              key={key}
                              className="grid grid-cols-3 gap-2 p-2 bg-gray-50 rounded"
                            >
                              <div className="font-mono text-xs font-semibold text-gray-600">
                                {key}
                              </div>
                              <div className="text-xs">
                                <div className="text-gray-600">
                                  De: {String(typedChange.old) || "sin valor"}
                                </div>
                              </div>
                              <div className="text-xs">
                                <div className="text-gray-700 font-semibold">
                                  A: {String(typedChange.new) || "sin valor"}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* Cambios en QA Asignados */}
            {selectedLog.action === "UPDATE" &&
              selectedLog.changes?.assigned_qa && (
                <div className="mb-6 p-4 bg-card rounded-lg border">
                  <h3 className="font-semibold text-gray-700 mb-3">
                    Cambios en QA Asignados
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-600 mb-2 font-semibold">
                        Anterior
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Array.isArray(
                          (
                            selectedLog.changes.assigned_qa as {
                              old: unknown;
                              new: unknown;
                            }
                          ).old,
                        )
                          ? (
                              selectedLog.changes.assigned_qa as {
                                old: string[];
                                new: string[];
                              }
                            ).old
                          : []
                        ).length === 0 ? (
                          <span className="text-gray-400 text-xs italic">
                            Sin QA asignados
                          </span>
                        ) : (
                          (
                            selectedLog.changes.assigned_qa as {
                              old: string[];
                              new: string[];
                            }
                          ).old.map((qa: string) => (
                            <span
                              key={qa}
                              className="inline-block bg-red-50 border border-red-200 text-red-700 rounded-full px-2.5 py-0.5 text-xs font-medium"
                            >
                              {qa}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600 mb-2 font-semibold">
                        Nuevo
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Array.isArray(
                          (
                            selectedLog.changes.assigned_qa as {
                              old: unknown;
                              new: unknown;
                            }
                          ).new,
                        )
                          ? (
                              selectedLog.changes.assigned_qa as {
                                old: string[];
                                new: string[];
                              }
                            ).new
                          : []
                        ).length === 0 ? (
                          <span className="text-gray-400 text-xs italic">
                            Sin QA asignados
                          </span>
                        ) : (
                          (
                            selectedLog.changes.assigned_qa as {
                              old: string[];
                              new: string[];
                            }
                          ).new.map((qa: string) => (
                            <span
                              key={qa}
                              className="inline-block bg-green-50 border border-green-200 text-green-700 rounded-full px-2.5 py-0.5 text-xs font-medium"
                            >
                              {qa}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Cambios en Equipos */}
            {selectedLog.action === "UPDATE" && selectedLog.changes?.squads && (
              <div className="mb-6 p-4 bg-card rounded-lg border">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Cambios en Equipos
                </h3>
                <SquadChangesTable
                  changes={detectSquadChanges(
                    selectedLog.changes.squads.old,
                    selectedLog.changes.squads.new,
                  )}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
