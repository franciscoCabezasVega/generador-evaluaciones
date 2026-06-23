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
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  Plus,
  X,
} from "lucide-react";
import { formatTime } from "@/lib/timingUtils";
import { TimeoutError } from "@/lib/withTimeout";

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
  /** Callback para sincronizar QA hacia la tarea cuando se añaden/quitan desde el form de timing */
  onQAChange?: (taskId: string, qaNames: string[]) => Promise<void>;
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
    onQAChange,
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

  const { products, timingCategories, qaMembers } = useCatalogData();
  const activeCategories = timingCategories.filter((c) => c.is_active);
  const activeQAMembers = qaMembers.filter((q) => q.is_active);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unsavedConfirm, setUnsavedConfirm] = useState(false);
  // Overrides the task status displayed in the modal when auto-completed by sync
  const [localTaskStatus, setLocalTaskStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [dynamicTasks, setDynamicTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [qaDropdownOpen, setQaDropdownOpen] = useState(false);
  const [syncingQA, setSyncingQA] = useState(false);

  // Exponer handleCancelWithConfirm a través de ref
  useImperativeHandle(ref, () => ({
    handleCancelWithConfirm,
  }));

  // Detectar cambios no guardados
  const hasUnsavedChanges = () => {
    return JSON.stringify(formData) !== JSON.stringify(initialDataRef.current);
  };

  // Agregar QA al timing y sincronizar con la tarea
  const addQA = async (qaName: string) => {
    if (formData.qa_entries.some((e) => e.qa_name === qaName)) return;
    const taskIdToSync = formData.task_id || null;
    // nextQaNames for onQAChange: derived from snapshot. Safe because the
    // dropdown closes after each add, so concurrent rapid adds via UI are
    // not possible and the async await serialises calls naturally.
    const nextQaNames = [...formData.qa_entries.map((e) => e.qa_name), qaName];
    // State update uses prev.qa_entries (not the closed-over snapshot) so
    // it composes correctly under React state batching (Round 4 fix).
    // No mutable variables are assigned inside the updater (Round 3 fix).
    setFormData((prev) => {
      if (prev.qa_entries.some((e) => e.qa_name === qaName)) return prev;
      return {
        ...prev,
        qa_entries: [
          ...prev.qa_entries,
          { qa_name: qaName, hours_by_category: {}, isExpanded: true },
        ],
      };
    });
    setQaDropdownOpen(false);
    if (onQAChange && taskIdToSync) {
      setSyncingQA(true);
      try {
        await onQAChange(taskIdToSync, nextQaNames);
      } catch (error) {
        // Rollback if backend rejected the change
        setFormData((prev) => ({
          ...prev,
          qa_entries: prev.qa_entries.filter((e) => e.qa_name !== qaName),
        }));
        throw error;
      } finally {
        setSyncingQA(false);
      }
    }
  };

  // Quitar QA del timing y sincronizar con la tarea
  const removeQA = async (qaName: string) => {
    // Same compute-first pattern as addQA — no side-effects inside updater.
    const removedIndex = formData.qa_entries.findIndex(
      (e) => e.qa_name === qaName,
    );
    if (removedIndex === -1) return;
    const removedEntry = formData.qa_entries[removedIndex];
    const taskIdToSync = formData.task_id || null;
    // Same snapshot/prev hybrid pattern as addQA (see comments there).
    const nextQaNames = formData.qa_entries
      .filter((e) => e.qa_name !== qaName)
      .map((e) => e.qa_name);
    setFormData((prev) => ({
      ...prev,
      qa_entries: prev.qa_entries.filter((e) => e.qa_name !== qaName),
    }));
    if (onQAChange && taskIdToSync) {
      setSyncingQA(true);
      try {
        await onQAChange(taskIdToSync, nextQaNames);
      } catch (error) {
        // Rollback if backend rejected the change
        setFormData((prev) => {
          if (prev.qa_entries.some((e) => e.qa_name === qaName)) return prev;
          const restored = [...prev.qa_entries];
          restored.splice(removedIndex, 0, removedEntry);
          return { ...prev, qa_entries: restored };
        });
        throw error;
      } finally {
        setSyncingQA(false);
      }
    }
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
          throw new Error("Error al cargar tareas");
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
    // Allow decimals up to 2 dp (DB column is NUMERIC(10,2); ClickUp sync
    // writes values like 20.88). Integer-only check removed in Round 6b.
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
    // Allow digits and one decimal point (max 2 decimal places) so that
    // ClickUp-synced values (e.g. 20.88) can be viewed and edited without
    // losing the decimal part. The DB column is NUMERIC(10,2).
    const filteredValue = value
      .replace(/[^0-9.]/g, "") // strip non-digit/non-dot
      .replace(/(\.[0-9]{0,2}).*/, "$1") // keep at most 2 decimal places
      .replace(/^\./, ""); // strip leading dot
    // Prevent multiple dots: if user types a second dot, ignore it
    const normalized =
      filteredValue.split(".").length > 2
        ? filteredValue.slice(0, filteredValue.lastIndexOf("."))
        : filteredValue;
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
    const hours = normalized === "" ? 0 : parseFloat(normalized);

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
                  className={`font-medium ${(localTaskStatus ?? linkedTask.status) === "Completada" ? "text-green-600" : "text-yellow-600"}`}
                >
                  {localTaskStatus ?? linkedTask.status}
                </span>
              </div>
            </div>
          );
        })()}

      {/* QA Asignados — selector editable */}
      {formData.task_id && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2 text-gray-700 dark:text-gray-900">
              <Users size={18} className="text-blue-600" />
              QA Asignados
              {syncingQA && (
                <Loader2 size={14} className="animate-spin text-blue-500" />
              )}
            </span>
            {/* Dropdown para añadir QA */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setQaDropdownOpen((v) => !v)}
                disabled={syncingQA}
                className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-700 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={13} /> Añadir QA
              </button>
              {qaDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                  {activeQAMembers.filter(
                    (m) =>
                      !formData.qa_entries.some((e) => e.qa_name === m.name),
                  ).length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">
                      Todos los QA ya están asignados
                    </p>
                  ) : (
                    activeQAMembers
                      .filter(
                        (m) =>
                          !formData.qa_entries.some(
                            (e) => e.qa_name === m.name,
                          ),
                      )
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            void addQA(m.name);
                          }}
                          disabled={syncingQA}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {m.name}
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>

          {formData.qa_entries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {formData.qa_entries.map((entry, idx) => (
                <span
                  key={entry.qa_name}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border ${QA_COLORS[idx % QA_COLORS.length]}`}
                >
                  {entry.qa_name}
                  <button
                    type="button"
                    onClick={() => {
                      void removeQA(entry.qa_name);
                    }}
                    disabled={syncingQA}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                    title={`Quitar ${entry.qa_name}`}
                    aria-label={`Quitar ${entry.qa_name} de los QA asignados`}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                <AlertCircle size={16} />
                No hay QA asignados. Usa &quot;Añadir QA&quot; para asignarlos.
              </p>
            </div>
          )}
        </div>
      )}

      {errors.qa_entries && (
        <p className="flex items-center gap-1 text-sm text-red-500">
          <AlertCircle size={16} />
          {errors.qa_entries}
        </p>
      )}

      {/* ClickUp Sync panel — visible cuando hay tarea seleccionada y safeFetch disponible */}
      {formData.task_id && safeFetch && (
        <ClickUpSyncInline
          taskId={formData.task_id}
          timingId={initialData?.id ? String(initialData.id) : undefined}
          taskLink={
            lockedTask?.task_link ??
            [...dynamicTasks, ...availableTasks].find(
              (t) => t.id === formData.task_id,
            )?.task_link
          }
          safeFetch={safeFetch}
          onTaskStatusChanged={() => setLocalTaskStatus("Completada")}
          onSyncSuccess={(freshQaEntries) => {
            setFormData((prev) => ({
              ...prev,
              // Solo actualizar horas de QA que ya están en el form.
              // No agregar QA nuevos desde el sync — el usuario puede haber
              // quitado intencionalmente a alguien.
              qa_entries: prev.qa_entries.map((entry) => {
                const fresh = freshQaEntries.find(
                  (e) => e.qa_name === entry.qa_name,
                );
                return fresh
                  ? { ...entry, hours_by_category: fresh.hours_by_category }
                  : entry;
              }),
            }));
          }}
        />
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
                            <div className="flex items-center gap-2">
                              {catHours > 0 && (
                                <span
                                  className="text-xs font-semibold opacity-80"
                                  style={{ color: cat.hex_color }}
                                >
                                  {formatTime(catHours)}
                                </span>
                              )}
                              <div className="relative flex items-center">
                                <input
                                  id={fieldId}
                                  name={fieldId}
                                  type="text"
                                  inputMode="decimal"
                                  value={catHours === 0 ? "" : catHours}
                                  onChange={(ev) =>
                                    updateQAHours(
                                      entry.qa_name,
                                      cat.id,
                                      ev.target.value,
                                    )
                                  }
                                  onKeyPress={(ev) => {
                                    // Allow digits and one decimal point
                                    if (!/[0-9.]/.test(ev.key))
                                      ev.preventDefault();
                                    // Block second dot
                                    if (
                                      ev.key === "." &&
                                      (
                                        ev.currentTarget as HTMLInputElement
                                      ).value.includes(".")
                                    )
                                      ev.preventDefault();
                                  }}
                                  onBlur={(ev) => {
                                    if (ev.target.value === "") {
                                      updateQAHours(entry.qa_name, cat.id, "0");
                                    }
                                  }}
                                  className="w-20 rounded border border-white/20 bg-white/10 py-0.5 pl-2 pr-6 text-center text-sm"
                                  disabled={isLoading}
                                  placeholder="0"
                                  aria-label={`${cat.name} en horas para ${entry.qa_name}`}
                                />
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute right-2 text-xs text-muted-foreground"
                                >
                                  h
                                </span>
                              </div>
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
                        {formatTime(qaTotal)}
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
            {formatTime(grandTotal)}
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
                  <span className="w-20 text-right font-semibold">
                    {formatTime(qaTotal)} ({pct.toFixed(0)}%)
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
            isLoading ||
            activeCategories.length === 0 ||
            formData.qa_entries.length === 0 ||
            grandTotal === 0
          }
          className="flex-1 bg-blue-500 hover:bg-blue-600"
          title={
            activeCategories.length === 0
              ? "No hay categorías de tiempo activas. Configúralas en Ajustes."
              : undefined
          }
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

// ─── ClickUp Sync inline panel (for use inside TimingForm) ───────────────────

interface ClickUpSyncInlineProps {
  taskId: string;
  timingId?: string;
  /** task_link de la tarea (ej: https://app.clickup.com/t/86e0pxw4d) — se usa
   *  para pre-rellenar el input cuando aún no hay un clickup_qa_task_id guardado. */
  taskLink?: string;
  safeFetch: (
    url: string,
    options?: RequestInit,
    retryCount?: number,
    timeoutMs?: number,
  ) => Promise<Response>;
  onSyncSuccess?: (
    qaEntries: Array<{
      qa_name: string;
      hours_by_category: Record<string, number>;
    }>,
  ) => void;
  /** Called when the sync auto-completes the task (ClickUp status is closed/done/etc.) */
  onTaskStatusChanged?: () => void;
}

interface ClickUpSyncInfo {
  registered: boolean;
  sync_enabled: boolean;
  clickup_qa_task_id: string | null;
  last_synced_at: string | null;
  last_clickup_status: string | null;
}

function ClickUpSyncInline({
  taskId,
  timingId,
  taskLink,
  safeFetch,
  onSyncSuccess,
  onTaskStatusChanged,
}: ClickUpSyncInlineProps) {
  // Extraer el ID del último segmento de la URL de ClickUp
  // ej: https://app.clickup.com/t/86e0pxw4d → "86e0pxw4d"
  const clickupIdFromLink = taskLink
    ? (taskLink
        .split("/")
        .filter(Boolean)
        .pop()
        ?.split("?")[0]
        ?.split("#")[0] ?? "")
    : "";

  const [clickupId, setClickupId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncInfo, setSyncInfo] = useState<ClickUpSyncInfo | null>(null);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    safeFetch(`/api/tasks/${taskId}/clickup-sync`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as ClickUpSyncInfo;
          setSyncInfo(data);
          // Prioridad: ID guardado en DB > ID extraído de task_link
          if (data.clickup_qa_task_id) {
            setClickupId(data.clickup_qa_task_id);
          } else if (clickupIdFromLink) {
            setClickupId(clickupIdFromLink);
          }

          // Auto-hidratación: si el sync está registrado y hay un timingId,
          // leer el timing fresco desde la BD (sin llamar a ClickUp) para que
          // el form refleje siempre el último valor escrito por el cron,
          // evitando que el caché de página muestre datos desactualizados.
          if (data.registered && timingId && onSyncSuccess) {
            try {
              const freshRes = await safeFetch(`/api/timings/${timingId}`);
              if (!cancelled && freshRes.ok) {
                const freshTiming = (await freshRes.json()) as {
                  qa_entries?: Array<{
                    qa_name: string;
                    hours_by_category: Record<string, number>;
                  }>;
                };
                if (freshTiming.qa_entries) {
                  onSyncSuccess(freshTiming.qa_entries);
                }
              }
            } catch {
              // silencioso — el form sigue con los datos pasados como initialData
            }
          }
        }
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate effect: when clickupIdFromLink becomes available after async task
  // load and there is no DB-registered sync ID, pre-fill the input.
  // This handles the case where taskLink arrives after the first fetch runs.
  useEffect(() => {
    if (
      clickupIdFromLink &&
      syncInfo &&
      !syncInfo.clickup_qa_task_id &&
      !clickupId
    ) {
      setClickupId(clickupIdFromLink);
    }
  }, [clickupIdFromLink, syncInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Siempre en modo preview: sync solo carga las horas en el form sin escribir
  // horas en BD. El guardado real ocurre al hacer clic en "Crear" o "Actualizar".
  // by design: el comportamiento es idéntico para timings nuevos y existentes.
  const previewOnly = true;

  const handleSync = async () => {
    const id = clickupId.trim();
    if (!id) {
      setMsg({ type: "error", text: "Ingresa el ID de la subtarea ClickUp." });
      return;
    }
    setSyncing(true);
    setMsg(null);
    try {
      // Timeout de 60s: el servidor llama a ClickUp (puede tardar ~30s) + operaciones DB
      const res = await safeFetch(
        `/api/tasks/${taskId}/clickup-sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clickup_qa_task_id: id,
            preview_only: previewOnly,
          }),
        },
        0,
        60_000,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        skipped?: boolean;
        error?: string;
        clickup_qa_task_id?: string;
        taskStatusChanged?: boolean;
        preview_qa_entries?: Array<{
          qa_name: string;
          hours_by_category: Record<string, number>;
        }>;
      };
      if (!res.ok) {
        setMsg({ type: "error", text: data.error ?? "Error al sincronizar" });
        return;
      }
      setSyncInfo((prev) => ({
        ...prev,
        registered: true,
        sync_enabled: true,
        clickup_qa_task_id: data.clickup_qa_task_id ?? id,
        // Siempre preview: el backend no persiste last_synced_at (Step 5a se omite).
        // Conservar el valor actual para evitar inconsistencia UI ↔ DB al recargar.
        last_synced_at: prev?.last_synced_at ?? null,
        last_clickup_status: prev?.last_clickup_status ?? null,
      }));

      if (data.taskStatusChanged) {
        onTaskStatusChanged?.();
      }

      // Hidratar el form con las horas de ClickUp.
      // Siempre preview: las horas vienen en la respuesta y se cargan en el form;
      // el guardado real ocurre al hacer clic en "Crear" o "Actualizar".
      if (!data.skipped && onSyncSuccess && data.preview_qa_entries) {
        onSyncSuccess(data.preview_qa_entries);
      }

      setMsg({
        type: "success",
        text: data.skipped
          ? "Sincronizado. No había registros de timing todavía — los tiempos se cargarán cuando existan entradas QA."
          : data.taskStatusChanged
            ? `Vista previa cargada desde ClickUp. La tarea fue marcada como Completada automáticamente. Haz clic en ${timingId ? "Actualizar" : "Crear"} para guardar las horas.`
            : `Vista previa cargada desde ClickUp. Revisa las horas y haz clic en ${timingId ? "Actualizar" : "Crear"} para guardar.`,
      });
    } catch (err) {
      console.error("[ClickUp sync error]", err);
      if (
        err instanceof TimeoutError ||
        (err instanceof Error && err.name === "TimeoutError")
      ) {
        setMsg({
          type: "error",
          text: "ClickUp tardó demasiado en responder. Espera unos segundos e intenta de nuevo.",
        });
      } else if (err instanceof Error && err.message.includes("sesión")) {
        setMsg({ type: "error", text: err.message });
      } else if (err instanceof Error && err.name === "AbortError") {
        setMsg({
          type: "error",
          text: "La solicitud fue cancelada. Intenta de nuevo.",
        });
      } else {
        setMsg({
          type: "error",
          text:
            err instanceof Error && err.message
              ? `Error: ${err.message}`
              : "Error de conexión. Intenta de nuevo.",
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Cargando sync ClickUp...</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
        <Zap className="w-3.5 h-3.5" />
        Sincronizar tiempos desde ClickUp
        {syncInfo?.registered && (
          <span className="ml-auto text-violet-500 font-normal">
            Registrado
            {syncInfo.last_synced_at
              ? ` · Último sync: ${new Date(syncInfo.last_synced_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}`
              : ""}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={clickupId}
          onChange={(e) => setClickupId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSync();
          }}
          placeholder="ID de subtarea ClickUp (ej: abc123xy)"
          className="flex-1 rounded border border-violet-300 bg-input px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          disabled={syncing}
        />
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing || !clickupId.trim()}
          className="inline-flex items-center gap-1.5 rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {syncing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          {syncing ? "Sincronizando..." : "Sincronizar"}
        </button>
      </div>
      {msg && (
        <div
          className={`flex items-start gap-1.5 text-xs rounded px-2 py-1.5 ${
            msg.type === "success"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          )}
          {msg.text}
        </div>
      )}
    </div>
  );
}
