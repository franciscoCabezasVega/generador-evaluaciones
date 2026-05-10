"use client";

import { Task, TaskTiming, TaskWithTiming } from "@/lib/types";
import { Edit2, Trash2, AlertCircle, Users, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/timingUtils";

interface TimingsListProps {
  entries: TaskWithTiming[];
  loading?: boolean;
  onEdit?: (timing: TaskTiming) => void;
  onDelete?: (id: string) => void;
  onRegister?: (task: Task) => void;
}

export default function TimingsList({
  entries,
  loading = false,
  onEdit,
  onDelete,
  onRegister,
}: TimingsListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-gray-200 bg-gray-100 h-16"
          />
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
        <AlertCircle className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-gray-500">No hay tareas en el rango seleccionado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const timing = entry.timing;
        const hasRegistered = !!timing;

        return (
          <div
            key={entry.id}
            className={`rounded-lg border p-4 transition-colors ${
              hasRegistered
                ? "border-gray-200 bg-white"
                : "border-dashed border-gray-300 bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Cabecera: badge de estado + nombre truncado (con tooltip) */}
                <div className="flex items-center gap-2 min-w-0">
                  {/* Badge de estado del timing */}
                  <span className="shrink-0">
                    {hasRegistered ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-300 px-2 py-0.5 text-xs font-semibold text-green-700">
                        <Clock size={11} />
                        Registrado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500">
                        <Clock size={11} />
                        Sin registrar
                      </span>
                    )}
                  </span>

                  {/* Nombre de la tarea — truncado con tooltip */}
                  <h4
                    className="font-semibold text-gray-800 truncate min-w-0"
                    title={entry.name}
                  >
                    {entry.task_link ? (
                      <a
                        href={entry.task_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                        title={entry.name}
                      >
                        {entry.name}
                      </a>
                    ) : (
                      entry.name
                    )}
                  </h4>
                </div>

                {/* Badges de la tarea en fila separada */}
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {entry.tshirt_size && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                      {entry.tshirt_size}
                    </span>
                  )}
                  {entry.project_type && (
                    <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {entry.project_type}
                    </span>
                  )}
                  {entry.effort_score_date && (
                    <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs text-green-700">
                      {entry.effort_score_date.split('-').reverse().join('/')}
                    </span>
                  )}
                </div>

                {/* QA Asignados (de la tarea) */}
                {Array.isArray(entry.assigned_qa) &&
                  entry.assigned_qa.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Users
                        size={14}
                        className="text-gray-400 mt-0.5 shrink-0"
                      />
                      {entry.assigned_qa.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}

                {/* Detalle de horas — solo si hay timing registrado */}
                {hasRegistered && timing && (
                  <>
                    {/* QA que registraron horas */}
                    {(timing.qa_entries ?? []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Users
                          size={14}
                          className="text-gray-500 mt-0.5 shrink-0"
                        />
                        {(timing.qa_entries ?? []).map((e) => (
                          <span
                            key={e.id}
                            className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {e.qa_name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Mini cards de horas */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        <span className="font-semibold">Testing:</span>
                        {formatTime(timing.effective_testing_hours)}
                      </div>
                      <div className="flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-700">
                        <span className="font-semibold">Espera Ambiente:</span>
                        {formatTime(timing.waiting_environment_hours)}
                      </div>
                      <div className="flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-xs text-orange-700">
                        <span className="font-semibold">Espera Fix:</span>
                        {formatTime(timing.waiting_development_fixes_hours)}
                      </div>
                      <div className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        <span className="font-semibold">Retest:</span>
                        {formatTime(timing.retest_hours)}
                      </div>
                      <div className="flex items-center gap-1 rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
                        <span className="font-semibold">Clarificaciones:</span>
                        {formatTime(timing.clarification_hours)}
                      </div>
                    </div>

                    {/* Breakdown por QA (si hay más de 1) */}
                    {(timing.qa_entries ?? []).length > 1 && (
                      <div className="mt-2 space-y-1">
                        {(timing.qa_entries ?? []).map((qae) => {
                          const total = Number(qae.total_hours) || 0;
                          return (
                            <div
                              key={qae.id}
                              className="flex items-center gap-2 text-xs text-gray-500"
                            >
                              <span className="font-medium w-28 truncate">
                                {qae.qa_name}
                              </span>
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 border border-gray-300">
                                <div
                                  className="h-1.5 rounded-full bg-blue-400"
                                  style={{
                                    width: `${timing.total_hours > 0 ? (total / timing.total_hours) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <span className="font-semibold">
                                {formatTime(total)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Total */}
                    <div className="mt-2 text-sm font-semibold text-gray-700">
                      Total: {formatTime(timing.total_hours)}
                    </div>
                  </>
                )}

                {/* Sin timing: mostrar "—" */}
                {!hasRegistered && (
                  <div className="mt-2 text-sm text-gray-400">Horas: —</div>
                )}
              </div>

              {/* Acciones */}
              <div className="flex gap-2 shrink-0">
                {hasRegistered && timing ? (
                  <>
                    {onEdit && (
                      <Button
                        onClick={() => onEdit(timing)}
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1"
                        title="Editar timing"
                      >
                        <Edit2 size={16} />
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        onClick={() => onDelete(timing.id)}
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                        title="Eliminar timing"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </>
                ) : (
                  onRegister && (
                    <Button
                      onClick={() => onRegister(entry)}
                      size="sm"
                      className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white text-xs"
                      title="Registrar tiempo"
                    >
                      <Plus size={14} />
                      Registrar tiempo
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
