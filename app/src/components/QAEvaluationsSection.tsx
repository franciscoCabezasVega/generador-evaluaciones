"use client";

import { useState, useCallback, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Save, Trash2, RefreshCw, AlertCircle, Eye } from "lucide-react";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { QAEvaluationRow } from "@/lib/types";
import QATasksDetailModal from "@/components/QATasksDetailModal";

// Convierte Date a string YYYY-MM-DD usando hora local (no UTC)
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Estado de edición local por fila
interface RowEditState {
  excelencia: string;
  soft_skills: string;
  comentarios: string;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
}

function initRowEditState(row: QAEvaluationRow): RowEditState {
  return {
    excelencia:
      row.excelencia !== null && row.excelencia !== undefined
        ? String(row.excelencia)
        : "",
    soft_skills:
      row.soft_skills !== null && row.soft_skills !== undefined
        ? String(row.soft_skills)
        : "",
    comentarios: row.comentarios ?? "",
    isDirty: false,
    isSaving: false,
    saveError: null,
  };
}

function SkeletonTable() {
  const cols = 8;
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-200">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-4 py-4">
                <div className="h-4 bg-gray-200 rounded w-28" />
              </td>
              <td className="px-4 py-4">
                <div className="h-5 bg-gray-200 rounded-full w-36" />
              </td>
              <td className="px-4 py-4">
                <div className="h-5 bg-gray-200 rounded w-8 mx-auto" />
              </td>
              <td className="px-4 py-4">
                <div className="h-5 bg-gray-200 rounded w-8 mx-auto" />
              </td>
              <td className="px-4 py-4">
                <div className="h-8 bg-gray-200 rounded w-16 mx-auto" />
              </td>
              <td className="px-4 py-4">
                <div className="h-8 bg-gray-200 rounded w-16 mx-auto" />
              </td>
              <td className="px-4 py-4">
                <div className="h-10 bg-gray-200 rounded w-full" />
              </td>
              <td className="px-4 py-4">
                <div className="flex gap-1 justify-center">
                  <div className="h-7 w-7 bg-gray-200 rounded" />
                  <div className="h-7 w-7 bg-gray-200 rounded" />
                  <div className="h-7 w-7 bg-gray-200 rounded" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatPeriod(startDate: string, endDate: string): string {
  const sd = new Date(startDate + "T12:00:00");
  const ed = new Date(endDate + "T12:00:00");
  return `${format(sd, "dd/MM/yyyy", { locale: es })} – ${format(ed, "dd/MM/yyyy", { locale: es })}`;
}

export default function QAEvaluationsSection() {
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: startOfMonth(today),
    endDate: endOfMonth(today),
  });

  const [rows, setRows] = useState<QAEvaluationRow[]>([]);
  const [editStates, setEditStates] = useState<Record<string, RowEditState>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailQA, setDetailQA] = useState<{ qaName: string } | null>(null);

  const { profile } = useAuth();
  const { safeFetch } = useSafeAuthFetch();
  const isAdmin = profile?.role === "admin";

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const startDate = toLocalDateString(dateRange.startDate);
      const endDate = toLocalDateString(dateRange.endDate);
      const response = await safeFetch(
        `/api/qa-evaluations?start_date=${startDate}&end_date=${endDate}`,
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `Error ${response.status}`,
        );
      }
      const data: QAEvaluationRow[] = await response.json();
      setRows(data);
      // Inicializar estado de edición para cada fila
      const states: Record<string, RowEditState> = {};
      for (const row of data) {
        states[row.qa_id] = initRowEditState(row);
      }
      setEditStates(states);
    } catch (err) {
      // Ignorar AbortError — ocurre en React StrictMode y al desmontar el componente.
      // No llamamos setLoading(false) para que el skeleton persista hasta el fetch real.
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.message === "The operation was aborted.")
      ) {
        return;
      }
      const msg =
        err instanceof Error ? err.message : "Error al cargar evaluaciones";
      setFetchError(msg);
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [dateRange, safeFetch]);

  // Cargar al montar y cuando cambia el rango
  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  const handleFieldChange = (
    qaId: string,
    field: "excelencia" | "soft_skills" | "comentarios",
    value: string,
  ) => {
    setEditStates((prev) => ({
      ...prev,
      [qaId]: { ...prev[qaId], [field]: value, isDirty: true, saveError: null },
    }));
  };

  const parseScore = (value: string): number | null => {
    if (value === "" || value === null || value === undefined) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    return n;
  };

  const handleSaveRow = async (qaId: string) => {
    const state = editStates[qaId];
    if (!state) return;

    // Validaciones frontend
    const excelencia = parseScore(state.excelencia);
    const softSkills = parseScore(state.soft_skills);

    if (excelencia !== null && (excelencia < 0 || excelencia > 5)) {
      setEditStates((prev) => ({
        ...prev,
        [qaId]: {
          ...prev[qaId],
          saveError: "Excelencia debe estar entre 0 y 5",
        },
      }));
      return;
    }
    if (softSkills !== null && (softSkills < 0 || softSkills > 5)) {
      setEditStates((prev) => ({
        ...prev,
        [qaId]: {
          ...prev[qaId],
          saveError: "Soft Skills debe estar entre 0 y 5",
        },
      }));
      return;
    }

    setEditStates((prev) => ({
      ...prev,
      [qaId]: { ...prev[qaId], isSaving: true, saveError: null },
    }));

    const startDate = toLocalDateString(dateRange.startDate);
    const endDate = toLocalDateString(dateRange.endDate);

    try {
      const response = await safeFetch("/api/qa-evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qa_id: qaId,
          start_date: startDate,
          end_date: endDate,
          excelencia: excelencia,
          soft_skills: softSkills,
          comentarios: state.comentarios || null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `Error ${response.status}`,
        );
      }

      // Actualizar la fila en el estado local
      setRows((prev) =>
        prev.map((r) => {
          if (r.qa_id !== qaId) return r;
          return {
            ...r,
            excelencia: excelencia,
            soft_skills: softSkills,
            comentarios: state.comentarios || null,
            has_persisted_evaluation: true,
          };
        }),
      );

      setEditStates((prev) => ({
        ...prev,
        [qaId]: { ...prev[qaId], isDirty: false, isSaving: false },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setEditStates((prev) => ({
        ...prev,
        [qaId]: { ...prev[qaId], isSaving: false, saveError: msg },
      }));
    }
  };

  const handleDeleteEvaluation = async (qaId: string, evaluationId: string) => {
    setIsDeleting(true);
    try {
      const response = await safeFetch(`/api/qa-evaluations/${evaluationId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `Error ${response.status}`,
        );
      }

      // Resetear la fila a vacía
      setRows((prev) =>
        prev.map((r) => {
          if (r.qa_id !== qaId) return r;
          return {
            ...r,
            id: "",
            excelencia: null,
            soft_skills: null,
            comentarios: null,
            has_persisted_evaluation: false,
          };
        }),
      );

      setEditStates((prev) => ({
        ...prev,
        [qaId]: {
          excelencia: "",
          soft_skills: "",
          comentarios: "",
          isDirty: false,
          isSaving: false,
          saveError: null,
        },
      }));

      setDeleteConfirmId(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {/* Header con selector de rango */}
      <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">
              Rango de fechas
            </label>
            <DateRangePicker
              value={dateRange}
              onChange={(range) => setDateRange(range)}
            />
          </div>
          <button
            onClick={fetchEvaluations}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed self-end"
            title="Actualizar"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-950/40 border border-amber-500/25 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-400">
            Tienes acceso de solo lectura a las evaluaciones de QA.
          </p>
        </div>
      )}

      {loading ? (
        <SkeletonTable />
      ) : fetchError ? (
        <div className="text-center py-10 text-gray-600">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={32} />
          <p className="mb-2">{fetchError}</p>
          <button
            onClick={fetchEvaluations}
            className="text-blue-600 hover:text-blue-800 underline text-sm"
          >
            Reintentar
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <p>No hay QAs configurados.</p>
          <p className="text-sm mt-1">
            Ve a Configuración &gt; QA Members para agregar miembros.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Nombre
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Periodo
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Tasa aceptación
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Cumplimiento
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Excelencia
                  <span className="block text-xs font-normal text-gray-500">
                    (0 – 5)
                  </span>
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Soft Skills
                  <span className="block text-xs font-normal text-gray-500">
                    (0 – 5)
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">
                  Comentarios
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const state = editStates[row.qa_id];
                if (!state) return null;
                const startDate = toLocalDateString(dateRange.startDate);
                const endDate = toLocalDateString(dateRange.endDate);
                return (
                  <tr
                    key={row.qa_id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Nombre */}
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {row.qa_name}
                    </td>

                    {/* Periodo */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                        {formatPeriod(startDate, endDate)}
                      </span>
                    </td>

                    {/* Tasa de aceptación (readonly) */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-sm font-mono">
                        {row.tasa_aceptacion != null
                          ? row.tasa_aceptacion % 1 === 0
                            ? row.tasa_aceptacion.toFixed(0)
                            : row.tasa_aceptacion
                          : 0}
                      </span>
                    </td>

                    {/* Cumplimiento (readonly) */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-sm font-mono">
                        {row.cumplimiento != null
                          ? row.cumplimiento % 1 === 0
                            ? row.cumplimiento.toFixed(0)
                            : row.cumplimiento
                          : 0}
                      </span>
                    </td>

                    {/* Excelencia */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        value={state.excelencia}
                        onChange={(e) =>
                          handleFieldChange(
                            row.qa_id,
                            "excelencia",
                            e.target.value,
                          )
                        }
                        disabled={!isAdmin}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="—"
                      />
                    </td>

                    {/* Soft Skills */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        value={state.soft_skills}
                        onChange={(e) =>
                          handleFieldChange(
                            row.qa_id,
                            "soft_skills",
                            e.target.value,
                          )
                        }
                        disabled={!isAdmin}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        placeholder="—"
                      />
                    </td>

                    {/* Comentarios */}
                    <td className="px-4 py-3">
                      <textarea
                        value={state.comentarios}
                        onChange={(e) =>
                          handleFieldChange(
                            row.qa_id,
                            "comentarios",
                            e.target.value,
                          )
                        }
                        onInput={(e) => {
                          const t = e.currentTarget;
                          t.style.height = "auto";
                          t.style.height = `${t.scrollHeight}px`;
                        }}
                        disabled={!isAdmin}
                        rows={1}
                        style={{ overflow: "hidden" }}
                        className="w-full min-w-[200px] border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed resize-none"
                        placeholder="Comentarios opcionales..."
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                      />
                      {state.saveError && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle size={12} />
                          {state.saveError}
                        </p>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        {/* Ver detalle — siempre visible */}
                        <button
                          onClick={() =>
                            setDetailQA({ qaName: row.qa_name ?? "" })
                          }
                          title="Ver tareas del periodo"
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-950/20 rounded transition"
                        >
                          <Eye size={15} />
                        </button>

                        {/* Guardar — solo para admin */}
                        {isAdmin && (
                          <button
                            onClick={() => handleSaveRow(row.qa_id)}
                            disabled={!state.isDirty || state.isSaving}
                            title={
                              !state.isDirty
                                ? "Sin cambios pendientes"
                                : "Guardar cambios"
                            }
                            className="p-1.5 text-blue-500 hover:text-blue-400 hover:bg-blue-950/20 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Save size={15} />
                          </button>
                        )}

                        {/* Eliminar — solo para admin */}
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteConfirmId(row.qa_id)}
                            disabled={
                              !row.has_persisted_evaluation || state.isDirty
                            }
                            title={
                              !row.has_persisted_evaluation
                                ? "No hay evaluación guardada"
                                : state.isDirty
                                  ? "Guarda los cambios antes de eliminar"
                                  : "Eliminar evaluación"
                            }
                            className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-950/20 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle de tareas QA */}
      {detailQA && (
        <QATasksDetailModal
          isOpen={true}
          qaName={detailQA.qaName}
          startDate={toLocalDateString(dateRange.startDate)}
          endDate={toLocalDateString(dateRange.endDate)}
          onClose={() => setDetailQA(null)}
        />
      )}

      {/* Modal de confirmación de borrado */}
      {deleteConfirmId &&
        (() => {
          const targetRow = rows.find((r) => r.qa_id === deleteConfirmId);
          return (
            <Modal
              isOpen={true}
              title="Confirmar eliminación"
              onClose={() => setDeleteConfirmId(null)}
              size="sm"
            >
              <div className="space-y-6">
                <p className="text-gray-600">
                  ¿Estás seguro de que deseas eliminar la evaluación de{" "}
                  <strong>{targetRow?.qa_name}</strong>? Esta acción no se puede
                  deshacer.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1"
                    disabled={isDeleting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      handleDeleteEvaluation(
                        deleteConfirmId,
                        targetRow?.id ?? "",
                      )
                    }
                    className="flex-1"
                    disabled={isDeleting || !targetRow?.id}
                  >
                    {isDeleting ? "Eliminando..." : "Eliminar"}
                  </Button>
                </div>
              </div>
            </Modal>
          );
        })()}
    </div>
  );
}
