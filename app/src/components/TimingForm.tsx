"use client";

import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  CreateTaskTimingInput,
  UpdateTaskTimingInput,
  Task,
  CreateTimingQAEntryInput,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Users,
  ExternalLink,
} from "lucide-react";

interface TimingFormProps {
  onSubmit: (
    data: CreateTaskTimingInput | UpdateTaskTimingInput,
  ) => Promise<void>;
  onCancel?: () => void;
  initialData?: Record<string, unknown> | null;
  isLoading?: boolean;
  isEditing?: boolean;
  availableTasks?: Task[];
  selectedTaskIds?: string[];
  safeFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  /** Cuando se pasa, la tarea queda bloqueada (no se muestran los selectores).
   *  Se usa desde la vista virtual de Tiempos al hacer "Registrar tiempo". */
  lockedTask?: Task;
}

interface QAFormData {
  qa_name: string;
  hours_by_category: Record<string, number>;
  isExpanded: boolean;
}

interface FormDataState {
  task_id?: string;
  product_type?: string;
  month: number;
  year: number;
  qa_entries: QAFormData[];
}

function TimingFormComponent(
  {
    onSubmit,
    onCancel,
    initialData,
    isLoading = false,
    isEditing = false,
    availableTasks = [],
    selectedTaskIds = [],
    safeFetch,
    lockedTask,
  }: TimingFormProps,
  ref: React.Ref<{ handleCancelWithConfirm: () => void }>,
) {
  const processInitialData = (
    data: Record<string, unknown> | null | undefined,
  ): FormDataState => {
    // Modo creación con tarea bloqueada (vista virtual de Tiempos)
    if (!data && lockedTask) {
      const assignedQAs: string[] = Array.isArray(lockedTask.assigned_qa)
        ? lockedTask.assigned_qa
        : [];
      const qaEntries: QAFormData[] = assignedQAs.map((qaName) => ({
        qa_name: qaName,
        hours_by_category: {},
        isExpanded: true,
      }));
      return {
        task_id: lockedTask.id,
        product_type: lockedTask.product_type,
        month: lockedTask.month,
        year: lockedTask.year,
        qa_entries: qaEntries,
      };
    }

    if (!data) {
      return {
        task_id: "",
        product_type: "",
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        qa_entries: [],
      };
    }

    // Convert existing timing data (with possible QA entries)
    const qaEntries: QAFormData[] = (
      Array.isArray(data.qa_entries) ? data.qa_entries : []
    ).map((e: Record<string, unknown>) => ({
      qa_name: String(e.qa_name || ""),
      hours_by_category: (e.hours_by_category &&
      typeof e.hours_by_category === "object" &&
      !Array.isArray(e.hours_by_category)
        ? e.hours_by_category
        : {}) as Record<string, number>,
      isExpanded: true,
    }));

    return {
      task_id: String(data.task_id || ""),
      product_type: String(data.product_type || ""),
      month: Number(data.month) || new Date().getMonth() + 1,
      year: Number(data.year) || new Date().getFullYear(),
      qa_entries: qaEntries,
    };
  };

  const initialFormData = processInitialData(initialData);
  const [formData, setFormData] = useState<FormDataState>(initialFormData);
  const initialDataRef = useRef<FormDataState>(initialFormData);

  const { products, timingCategories } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unsavedConfirm, setUnsavedConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [dynamicTasks, setDynamicTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Exponer handleCancelWithConfirm a través de ref
  useImperativeHandle(ref, () => ({
    handleCancelWithConfirm,
  }));

  // Detectar cambios no guardados
  const hasUnsavedChanges = () => {
    return JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
  };

  const handleCancelWithConfirm = () => {
    if (hasUnsavedChanges()) {
      setUnsavedConfirm(true);
      setPendingAction(() => onCancel);
    } else {
      onCancel?.();
    }
  };

  // Cargar tareas dinámicamente cuando cambien mes, año y product_type (solo en modo creación)
  useEffect(() => {
    if (isEditing || !safeFetch) return;

    const loadTasksForFilters = async () => {
      if (!formData.month || !formData.year || !formData.product_type) {
        setDynamicTasks([]);
        return;
      }

      try {
        setLoadingTasks(true);
        const url = `/api/tasks?month=${formData.month}&year=${formData.year}&product_type=${formData.product_type}`;
        const response = await safeFetch(url);

        if (!response.ok) {
          throw new Error("Error loading tasks");
        }

        const data = await response.json();
        setDynamicTasks(data || []);
      } catch (error) {
        console.error("Error loading tasks:", error);
        setDynamicTasks([]);
      } finally {
        setLoadingTasks(false);
      }
    };

    loadTasksForFilters();
  }, [
    formData.month,
    formData.year,
    formData.product_type,
    isEditing,
    safeFetch,
  ]);

  const validateHours = (value: string, fieldName: string): string => {
    if (value === "" || value === "0") return "";
    const num = parseFloat(value);
    if (isNaN(num)) return `${fieldName} debe ser un número válido`;
    if (!Number.isInteger(num))
      return `${fieldName} debe ser un número entero (sin decimales)`;
    if (num < 0) return `${fieldName} no puede ser negativo`;
    return "";
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "task_id" && value && !isEditing) {
      // When a task is selected, pre-populate QA entries from the task's assigned_qa
      const selectedTask = dynamicTasks.find((t) => t.id === value);
      const assignedQAs: string[] =
        selectedTask?.assigned_qa && Array.isArray(selectedTask.assigned_qa)
          ? selectedTask.assigned_qa
          : [];

      if (assignedQAs.length > 0) {
        const newQAEntries: QAFormData[] = assignedQAs.map((qaName) => {
          // Preserve existing QA entry data if already present
          const existing = formData.qa_entries.find(
            (e) => e.qa_name === qaName,
          );
          return (
            existing || {
              qa_name: qaName,
              hours_by_category: {},
              isExpanded: true,
            }
          );
        });

        setFormData((prev) => ({
          ...prev,
          task_id: value,
          qa_entries: newQAEntries,
        }));
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // QA entry handlers
  const toggleQAExpanded = (qaName: string) => {
    setFormData((prev) => ({
      ...prev,
      qa_entries: prev.qa_entries.map((e) =>
        e.qa_name === qaName ? { ...e, isExpanded: !e.isExpanded } : e,
      ),
    }));
  };

  const updateQAHours = (qaName: string, categoryId: string, value: string) => {
    const filteredValue = value.replace(/[^0-9]/g, "");
    const key = `${qaName}_${categoryId}`;

    if (filteredValue !== "") {
      const catLabel =
        activeCategories.find((c) => c.id === categoryId)?.name ?? "Horas";
      const error = validateHours(filteredValue, catLabel);
      if (error) {
        setErrors((prev) => ({ ...prev, [key]: error }));
        return;
      }
    }

    setErrors((prev) => ({ ...prev, [key]: "" }));
    const hours = filteredValue === "" ? 0 : parseInt(filteredValue, 10);

    setFormData((prev) => ({
      ...prev,
      qa_entries: prev.qa_entries.map((e) =>
        e.qa_name === qaName
          ? {
              ...e,
              hours_by_category: {
                ...e.hours_by_category,
                [categoryId]: hours,
              },
            }
          : e,
      ),
    }));
  };

  const getQATotal = (entry: QAFormData) => {
    return Object.values(entry.hours_by_category).reduce(
      (sum, h) => sum + (h || 0),
      0,
    );
  };

  const getGrandTotal = () => {
    return formData.qa_entries.reduce((sum, e) => sum + getQATotal(e), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones finales
    if (!isEditing && !lockedTask) {
      if (!formData.task_id) {
        setErrors({
          task_id: "La tarea es requerida",
        });
        return;
      }
    }

    // Bloquear submit si la tarea bloqueada no tiene QAs
    if (lockedTask && formData.qa_entries.length === 0) {
      setErrors({
        qa_entries:
          "La tarea no tiene QA asignados. Edita la tarea para asignar QA.",
      });
      return;
    }

    if (formData.qa_entries.length === 0) {
      setErrors({ qa_entries: "Debes asignar al menos un QA" });
      return;
    }

    // Validate each QA has at least some hours
    for (const entry of formData.qa_entries) {
      const total = getQATotal(entry);
      if (total === 0) {
        setErrors({
          qa_entries: `${entry.qa_name} debe tener al menos una hora registrada`,
        });
        return;
      }
    }

    try {
      const qaEntries: CreateTimingQAEntryInput[] = formData.qa_entries.map(
        (e) => ({
          qa_name: e.qa_name,
          hours_by_category: e.hours_by_category,
        }),
      );

      const payload = isEditing
        ? { qa_entries: qaEntries }
        : {
            task_id: formData.task_id,
            month: Number(formData.month),
            year: Number(formData.year),
            qa_entries: qaEntries,
          };

      await onSubmit(payload as CreateTaskTimingInput | UpdateTaskTimingInput);
    } catch (error) {
      console.error("Error submitting form:", error);
    }
  };

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const CURRENT_YEAR = new Date().getFullYear();
  const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);

  const grandTotal = getGrandTotal();

  // Color palette for QA members
  const QA_COLORS = [
    "border-blue-400 bg-blue-50",
    "border-emerald-400 bg-emerald-500/10",
    "border-purple-400 bg-purple-500/10",
    "border-amber-400 bg-amber-500/10",
    "border-pink-400 bg-pink-500/10",
    "border-cyan-400 bg-cyan-500/10",
    "border-rose-400 bg-rose-500/10",
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 p-6 max-h-[80vh] overflow-y-auto"
    >
      {/* Modal de confirmación de cambios no guardados */}
      <Modal
        isOpen={unsavedConfirm}
        title="Cambios sin guardar"
        onClose={() => setUnsavedConfirm(false)}
        size="md"
      >
        <div className="space-y-6 p-6">
          <p className="text-gray-700">
            Tienes cambios sin guardar. ¿Deseas descartar los cambios?
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              onClick={() => setUnsavedConfirm(false)}
              variant="outline"
              className="whitespace-nowrap"
            >
              Continuar editando
            </Button>
            <Button
              type="button"
              onClick={() => {
                setUnsavedConfirm(false);
                pendingAction?.();
              }}
              className="bg-red-500 hover:bg-red-600 whitespace-nowrap"
            >
              Descartar cambios
            </Button>
          </div>
        </div>
      </Modal>

      {/* Año y Mes - solo en modo creación sin tarea bloqueada */}
      {!isEditing && !lockedTask && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium">
              Año
            </label>
            <select
              id="year"
              name="year"
              value={formData.year}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="month" className="block text-sm font-medium">
              Mes
            </label>
            <select
              id="month"
              name="month"
              value={formData.month}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Producto - solo en modo creación sin tarea bloqueada */}
      {!isEditing && !lockedTask && (
        <div>
          <label htmlFor="product_type" className="block text-sm font-medium">
            Producto
          </label>
          <select
            id="product_type"
            name="product_type"
            value={formData.product_type || ""}
            onChange={handleInputChange}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            required
          >
            <option value="">Selecciona un producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tarea - solo en modo creación sin tarea bloqueada */}
      {!isEditing && !lockedTask && (
        <div>
          <label htmlFor="task_id" className="block text-sm font-medium">
            Tarea
          </label>
          {(() => {
            const hasSelectedMonth = Number(formData.month) > 0;
            const hasSelectedYear = Number(formData.year) > 0;
            const hasSelectedProduct = Boolean(formData.product_type);
            const isFormReady =
              hasSelectedMonth && hasSelectedYear && hasSelectedProduct;

            const filteredTasks = isFormReady
              ? dynamicTasks.filter(
                  (task) => !selectedTaskIds.includes(task.id),
                )
              : [];

            const hasNoTasks = isFormReady && filteredTasks.length === 0;

            return (
              <>
                <select
                  id="task_id"
                  name="task_id"
                  value={formData.task_id || ""}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                  disabled={!isFormReady || hasNoTasks || loadingTasks}
                  required
                >
                  {!isFormReady ? (
                    <option value="">
                      Selecciona Año, Mes y Producto primero
                    </option>
                  ) : loadingTasks ? (
                    <option value="">Cargando tareas...</option>
                  ) : hasNoTasks ? (
                    <option value="">
                      No hay tareas completadas que coincidan con esta búsqueda
                    </option>
                  ) : (
                    <>
                      <option value="">Selecciona una tarea</option>
                      {filteredTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </>
            );
          })()}
          {errors.task_id && (
            <p className="mt-1 flex items-center gap-1 text-sm text-red-500">
              <AlertCircle size={16} />
              {errors.task_id}
            </p>
          )}
        </div>
      )}

      {/* Info de tarea asociada — modo edición o tarea bloqueada */}
      {(isEditing || lockedTask) &&
        (() => {
          const linkedTask =
            lockedTask ?? availableTasks.find((t) => t.id === formData.task_id);
          if (!linkedTask) return null;
          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tarea asociada
                </span>
                <a
                  href={`/tasks?edit=${linkedTask.id}&month=${linkedTask.month}&year=${linkedTask.year}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ir a tarea <ExternalLink size={12} />
                </a>
              </div>
              {linkedTask.task_link ? (
                <a
                  href={linkedTask.task_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {linkedTask.name}
                </a>
              ) : (
                <p className="text-sm font-semibold text-gray-900">
                  {linkedTask.name}
                </p>
              )}
              <div className="flex gap-4 text-xs text-gray-500">
                <span>{linkedTask.product_type}</span>
                <span>
                  {linkedTask.month}/{linkedTask.year}
                </span>
                <span
                  className={`font-medium ${linkedTask.status === "Completada" ? "text-green-600" : "text-yellow-600"}`}
                >
                  {linkedTask.status}
                </span>
              </div>
            </div>
          );
        })()}

      {/* QA Asignados — solo lectura (se toma de la tarea) */}
      {formData.qa_entries.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <Users size={18} className="text-blue-600" />
              QA Asignados
            </span>
            <span className="text-xs text-gray-500">
              {formData.qa_entries.length} QA
              {formData.qa_entries.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {formData.qa_entries.map((entry, idx) => (
              <span
                key={entry.qa_name}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${QA_COLORS[idx % QA_COLORS.length]}`}
              >
                {entry.qa_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {formData.qa_entries.length === 0 && formData.task_id && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <p className="text-sm text-yellow-800 flex items-center gap-2">
            <AlertCircle size={16} />
            La tarea seleccionada no tiene QA asignados. Edita la tarea para
            asignar QA.
          </p>
        </div>
      )}

      {errors.qa_entries && (
        <p className="flex items-center gap-1 text-sm text-red-500">
          <AlertCircle size={16} />
          {errors.qa_entries}
        </p>
      )}

      {/* Per-QA Hour Entries */}
      {formData.qa_entries.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-gray-700">Horas por QA</h3>

          {formData.qa_entries.map((entry, qaIdx) => {
            const qaTotal = getQATotal(entry);
            return (
              <div
                key={entry.qa_name}
                className={`rounded-xl border-2 overflow-hidden ${QA_COLORS[qaIdx % QA_COLORS.length]}`}
              >
                {/* QA Header */}
                <button
                  type="button"
                  onClick={() => toggleQAExpanded(entry.qa_name)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    <span className="font-semibold text-sm">
                      {entry.qa_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">
                      {qaTotal.toFixed(0)}h
                    </span>
                    {entry.isExpanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </button>

                {/* QA Hours Fields */}
                {entry.isExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {activeCategories.length === 0 && (
                      <p className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                        No hay categorías de tiempo activas. Configúralas en
                        Ajustes.
                      </p>
                    )}
                    {activeCategories.map((cat) => {
                      const catHours = entry.hours_by_category[cat.id] ?? 0;
                      // fieldId: id HTML válido (sin espacios/símbolos del nombre del QA)
                      const fieldId = `qa_${qaIdx}_${cat.id}`;
                      // errorKey: clave del mapa de errores, debe coincidir con lo que usa updateQAHours
                      const errorKey = `${entry.qa_name}_${cat.id}`;
                      return (
                        <div
                          key={`${entry.qa_name}-${cat.id}`}
                          className="rounded-lg p-3"
                          style={{ backgroundColor: `${cat.hex_color}22` }}
                        >
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={fieldId}
                              className="text-xs font-medium"
                              style={{ color: cat.hex_color }}
                            >
                              {cat.name}
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                id={fieldId}
                                name={fieldId}
                                type="text"
                                inputMode="numeric"
                                value={catHours === 0 ? "" : catHours}
                                onChange={(ev) =>
                                  updateQAHours(
                                    entry.qa_name,
                                    cat.id,
                                    ev.target.value,
                                  )
                                }
                                onKeyPress={(ev) => {
                                  if (!/[0-9]/.test(ev.key))
                                    ev.preventDefault();
                                }}
                                onBlur={(ev) => {
                                  if (ev.target.value === "") {
                                    updateQAHours(entry.qa_name, cat.id, "0");
                                  }
                                }}
                                className="w-16 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-center text-sm"
                                disabled={isLoading}
                                placeholder="0"
                                aria-label={`${cat.name} para ${entry.qa_name}`}
                              />
                            </div>
                          </div>
                          {errors[errorKey] && (
                            <p className="mt-1 text-xs text-red-600">
                              {errors[errorKey]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {/* QA Subtotal */}
                    <div className="rounded-lg bg-white/5 p-2 flex justify-between border border-white/10">
                      <span className="text-xs font-medium text-gray-600">
                        Subtotal {entry.qa_name}:
                      </span>
                      <span className="text-sm font-bold">
                        {qaTotal.toFixed(0)}h
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Grand Total */}
      <div className="rounded-lg bg-gray-100 p-4 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold text-gray-800">Total General:</span>
            {formData.qa_entries.length > 1 && (
              <span className="ml-2 text-xs text-gray-500">
                ({formData.qa_entries.length} QAs)
              </span>
            )}
          </div>
          <span className="text-xl font-bold text-gray-900">
            {grandTotal.toFixed(2)} h
          </span>
        </div>
        {/* Per-QA summary bar */}
        {formData.qa_entries.length > 1 && grandTotal > 0 && (
          <div className="mt-3 space-y-1">
            {formData.qa_entries.map((entry, idx) => {
              const qaTotal = getQATotal(entry);
              const pct = (qaTotal / grandTotal) * 100;
              return (
                <div
                  key={entry.qa_name}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-28 truncate font-medium text-gray-600">
                    {entry.qa_name}
                  </span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: [
                          "#3B82F6",
                          "#10B981",
                          "#8B5CF6",
                          "#F59E0B",
                          "#EC4899",
                          "#06B6D4",
                          "#F43F5E",
                        ][idx % 7],
                      }}
                    />
                  </div>
                  <span className="w-14 text-right font-semibold">
                    {qaTotal.toFixed(0)}h ({pct.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            isLoading || grandTotal === 0 || formData.qa_entries.length === 0
          }
          className="flex-1 bg-blue-500 hover:bg-blue-600"
        >
          {isLoading ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
        </Button>
        <Button
          type="button"
          onClick={handleCancelWithConfirm}
          disabled={isLoading}
          variant="outline"
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export default forwardRef(TimingFormComponent);
