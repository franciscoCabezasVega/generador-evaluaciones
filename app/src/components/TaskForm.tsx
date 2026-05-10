"use client";

import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useEffect,
} from "react";
import {
  CreateTaskInput,
  SquadData,
  ProductType,
  TshirtSize,
  TaskProjectType,
} from "@/lib/types";
import { useCatalogData } from "@/hooks/useCatalogData";
import { calculateTaskScore, formatScore } from "@/lib/scoreCalculator";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Plus,
  Minus,
  X,
  ChevronDown,
  Check,
  Users,
  Calendar,
  Ruler,
  Tag,
} from "lucide-react";

interface TaskFormProps {
  onSubmit: (data: CreateTaskInput) => Promise<void>;
  onCancel?: () => void;
  initialData?: Record<string, unknown> | null;
  isLoading?: boolean;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);

interface FormDataState {
  name: string;
  task_link: string;
  product_type: ProductType;
  squads: SquadData[];
  assigned_qa: string[];
  status: "Completada" | "Deprecada" | "Pendiente";
  month: number;
  year: number;
  effort_score_date: string;
  tshirt_size: TshirtSize;
  project_type: TaskProjectType;
}

function TaskFormComponent(
  { onSubmit, onCancel, initialData, isLoading = false }: TaskFormProps,
  ref: React.Ref<{ handleCancelWithConfirm: () => void }>,
) {
  // Convertir initialData si es necesario (para ediciones de tareas con squad legacy)
  const processInitialData = (
    data: Record<string, unknown> | null | undefined,
  ): FormDataState => {
    if (!data) {
      return {
        name: "",
        task_link: "",
        product_type: "Platform",
        squads: [],
        assigned_qa: [],
        status: "Pendiente",
        month: new Date().getMonth() + 1,
        year: CURRENT_YEAR,
        effort_score_date: new Date().toISOString().split("T")[0],
        tshirt_size: "Estándar",
        project_type: "Nueva funcionalidad",
      };
    }

    // Si data.squads existe, devolver como está (cada squad gestiona sus propias notas)
    const parsed = data as unknown as FormDataState;
    return {
      ...parsed,
      assigned_qa: Array.isArray(parsed.assigned_qa) ? parsed.assigned_qa : [],
      effort_score_date:
        parsed.effort_score_date || new Date().toISOString().split("T")[0],
      tshirt_size: parsed.tshirt_size || "Estándar",
      project_type: parsed.project_type || "Nueva funcionalidad",
    };
  };

  const [formData, setFormData] = useState<FormDataState>(() =>
    processInitialData(initialData),
  );
  const initialDataRef = useRef<FormDataState | null>(null);
  if (initialDataRef.current === null) {
    initialDataRef.current = processInitialData(initialData);
  }

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [focusedReturnsField, setFocusedReturnsField] = useState<string | null>(
    null,
  );
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [unsavedConfirm, setUnsavedConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [showQASelector, setShowQASelector] = useState(false);
  const qaDropdownRef = useRef<HTMLDivElement>(null);

  const {
    products,
    projectTypes,
    complexities,
    squads: allSquads,
    qaMembers,
  } = useCatalogData();

  // Sincronizar product_type con el primer producto disponible si el valor inicial no existe en la BD
  useEffect(() => {
    if (products.length > 0 && !initialData) {
      const currentProductExists = products.some(
        (p) => p.name === formData.product_type,
      );
      if (!currentProductExists) {
        setFormData((prev) => ({
          ...prev,
          product_type: products[0].name as ProductType,
          squads: [],
        }));
      }
    }
    // Solo ejecutar cuando los productos se carguen por primera vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Sincronizar tshirt_size con la primera complejidad disponible si el valor no existe en la BD
  useEffect(() => {
    if (complexities.length > 0) {
      const currentExists = complexities.some(
        (c) => c.name === formData.tshirt_size,
      );
      if (!currentExists) {
        setFormData((prev) => ({
          ...prev,
          tshirt_size: complexities[0].name as TshirtSize,
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexities]);

  // Squads activos del producto seleccionado, filtrando los ya agregados
  const productObj = products.find((p) => p.name === formData.product_type);
  const availableSquads = productObj
    ? allSquads.filter((s) => s.product_id === productObj.id)
    : [];
  const selectedSquadNames = formData.squads.map((s) => s.squad);
  const availableSquadsToAdd = availableSquads
    .filter((s) => !selectedSquadNames.includes(s.name))
    .map((s) => s.name);

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

  // Cerrar dropdown QA al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        qaDropdownRef.current &&
        !qaDropdownRef.current.contains(event.target as Node)
      ) {
        setShowQASelector(false);
      }
    };
    if (showQASelector) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showQASelector]);

  // Toggle QA assignment
  const toggleQA = useCallback((qaName: string) => {
    setFormData((prev) => {
      const exists = prev.assigned_qa.includes(qaName);
      return {
        ...prev,
        assigned_qa: exists
          ? prev.assigned_qa.filter((q) => q !== qaName)
          : [...prev.assigned_qa, qaName],
      };
    });
  }, []);

  const removeQA = useCallback((qaName: string) => {
    setFormData((prev) => ({
      ...prev,
      assigned_qa: prev.assigned_qa.filter((q) => q !== qaName),
    }));
  }, []);

  // Validar URL — requiere http o https para prevenir esquemas peligrosos
  const isValidUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleBlur = async (fieldName: string) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));

    if (fieldName === "name" && formData.name.trim() === "") {
      setErrors((prev) => ({ ...prev, name: "El nombre es requerido" }));
    } else if (fieldName === "name") {
      setErrors((prev) => ({ ...prev, name: "" }));
    }

    if (fieldName === "task_link") {
      if (formData.task_link.trim() === "") {
        setErrors((prev) => ({ ...prev, task_link: "El link es requerido" }));
      } else if (!isValidUrl(formData.task_link)) {
        setErrors((prev) => ({
          ...prev,
          task_link: "El link debe ser una URL válida",
        }));
      } else {
        setErrors((prev) => ({ ...prev, task_link: "" }));
      }
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    // Si cambia el producto, limpiar squads/equipos
    if (name === "product_type") {
      setFormData((prev) => ({
        ...prev,
        product_type: value as ProductType,
        squads: [], // Limpiar squads cuando cambia el producto
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === "month" || name === "year" ? parseInt(value) : value,
      }));
    }
  };

  const handleAddSquad = useCallback(
    (squad: string) => {
      if (selectedSquadNames.includes(squad)) return;

      setFormData((prev) => ({
        ...prev,
        squads: [
          ...prev.squads,
          {
            squad,
            low_returns: 0,
            medium_returns: 0,
            high_returns: 0,
            additional_notes: "",
          },
        ],
      }));
    },
    [selectedSquadNames],
  );

  const handleRemoveSquad = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, squadToRemove: string) => {
      e.preventDefault();
      e.stopPropagation();
      setFormData((prev) => ({
        ...prev,
        squads: prev.squads.filter((s) => s.squad !== squadToRemove),
      }));
    },
    [],
  );

  const handleUpdateSquadReturns = useCallback(
    (
      squad: string,
      field: "low_returns" | "medium_returns" | "high_returns",
      value: number,
    ) => {
      setFormData((prev) => ({
        ...prev,
        squads: prev.squads.map((s) =>
          s.squad === squad ? { ...s, [field]: Math.max(0, value) } : s,
        ),
      }));
    },
    [],
  );

  const handleUpdateSquadNotes = useCallback((squad: string, notes: string) => {
    setFormData((prev) => ({
      ...prev,
      squads: prev.squads.map((s) =>
        s.squad === squad ? { ...s, additional_notes: notes } : s,
      ),
    }));
  }, []);

  const handleReturnsKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      squad: string,
      field: "low_returns" | "medium_returns" | "high_returns",
    ) => {
      const squadData = formData.squads.find((s) => s.squad === squad);
      if (!squadData) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleUpdateSquadReturns(squad, field, squadData[field] + 1);
      } else if (e.key === "-") {
        e.preventDefault();
        handleUpdateSquadReturns(
          squad,
          field,
          Math.max(0, squadData[field] - 1),
        );
      }
    },
    [formData.squads, handleUpdateSquadReturns],
  );

  const handleIncrementReturns = useCallback(
    (
      e: React.MouseEvent<HTMLButtonElement>,
      squad: string,
      field: "low_returns" | "medium_returns" | "high_returns",
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const squadData = formData.squads.find((s) => s.squad === squad);
      if (squadData) {
        handleUpdateSquadReturns(squad, field, squadData[field] + 1);
      }
    },
    [formData.squads, handleUpdateSquadReturns],
  );

  const handleDecrementReturns = useCallback(
    (
      e: React.MouseEvent<HTMLButtonElement>,
      squad: string,
      field: "low_returns" | "medium_returns" | "high_returns",
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const squadData = formData.squads.find((s) => s.squad === squad);
      if (squadData) {
        handleUpdateSquadReturns(
          squad,
          field,
          Math.max(0, squadData[field] - 1),
        );
      }
    },
    [formData.squads, handleUpdateSquadReturns],
  );

  // Validar si el formulario es válido
  const isFormValid = () => {
    const hasNoErrors = !errors.name && !errors.task_link;
    return (
      formData.name.trim() !== "" &&
      formData.task_link.trim() !== "" &&
      formData.squads.length > 0 &&
      formData.assigned_qa.length > 0 &&
      formData.effort_score_date !== "" &&
      !!formData.tshirt_size &&
      !!formData.project_type &&
      hasNoErrors
    );
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const newErrors: Record<string, string> = {};

      if (!formData.name.trim()) {
        newErrors.name = "El nombre es requerido";
      }
      if (!formData.task_link.trim()) {
        newErrors.task_link = "El link es requerido";
      } else if (!isValidUrl(formData.task_link)) {
        newErrors.task_link = "El link debe ser una URL válida";
      }
      if (formData.squads.length === 0) {
        newErrors.squads = "Debes agregar al menos un squad";
      }
      if (formData.assigned_qa.length === 0) {
        newErrors.assigned_qa = "Debes asignar al menos un QA";
      }
      if (!formData.effort_score_date) {
        newErrors.effort_score_date = "La fecha de puntuación es requerida";
      }
      if (!formData.tshirt_size) {
        newErrors.tshirt_size = "La complejidad es requerida";
      }
      if (!formData.project_type) {
        newErrors.project_type = "El tipo de proyecto es requerido";
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setLocalSubmitting(true);
      // Safety timeout: si la operación no se resuelve en 10s,
      // forzar recuperación del botón para que el usuario pueda reintentar.
      // Cubre edge-cases donde el fetch queda colgado (ej. navigator.locks
      // bloqueado por cambio de pestañas del navegador).
      const safetyTimer = setTimeout(() => {
        setLocalSubmitting(false);
        setErrors({
          submit:
            "La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.",
        });
      }, 10000);

      try {
        await onSubmit(formData as CreateTaskInput);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Error desconocido";

        if (
          errorMessage.includes("link already exists") ||
          errorMessage.includes("Este link ya existe")
        ) {
          setErrors({
            task_link:
              "Este link ya existe en otra tarea. Usa un link diferente.",
          });
          setTimeout(() => {
            linkInputRef.current?.focus();
            linkInputRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 100);
        } else {
          setErrors({ submit: errorMessage });
        }
      } finally {
        clearTimeout(safetyTimer);
        setLocalSubmitting(false);
      }
    },
    [formData, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="task-form">
      {/* Sección 1: Información básica */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">
          Información de la Tarea
        </legend>

        <div>
          <label htmlFor="task-name" className="block text-sm font-medium mb-2">
            Nombre *
          </label>
          <input
            id="task-name"
            type="text"
            name="name"
            autoComplete="off"
            value={formData.name}
            onChange={handleInputChange}
            onBlur={() => handleBlur("name")}
            className={`w-full border rounded-lg px-4 py-2 ${
              touched.name && errors.name
                ? "border-red-500 bg-red-950/40"
                : "border-gray-300"
            }`}
            placeholder="Nombre de la tarea"
          />
          {touched.name && errors.name && (
            <p className="text-red-600 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label htmlFor="task-link" className="block text-sm font-medium mb-2">
            Link *
          </label>
          <input
            id="task-link"
            ref={linkInputRef}
            type="url"
            name="task_link"
            autoComplete="url"
            value={formData.task_link}
            onChange={handleInputChange}
            onBlur={() => handleBlur("task_link")}
            className={`w-full border rounded-lg px-4 py-2 ${
              touched.task_link && errors.task_link
                ? "border-red-500 bg-red-950/40"
                : "border-gray-300"
            }`}
            placeholder="https://..."
          />
          {touched.task_link && errors.task_link && (
            <p className="text-red-600 text-sm mt-1">{errors.task_link}</p>
          )}
        </div>
      </fieldset>

      {/* Sección 2: Clasificación (Producto, Tipo Proyecto, Complejidad) */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">
          Clasificación
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div data-tour="task-form-product">
            <label
              htmlFor="product-type"
              className="block text-sm font-medium mb-2"
            >
              Producto *
            </label>
            <select
              id="product-type"
              name="product_type"
              value={formData.product_type}
              onChange={handleInputChange}
              className="w-full border rounded-lg px-4 py-2"
            >
              {products.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="task-project-type"
              className="block text-sm font-medium mb-2 flex items-center gap-1.5"
            >
              <Tag size={14} className="text-purple-600" />
              Tipo Proyecto *
            </label>
            <select
              id="task-project-type"
              name="project_type"
              value={formData.project_type}
              onChange={handleInputChange}
              className={`w-full border rounded-lg px-4 py-2 ${errors.project_type ? "border-red-500 bg-red-950/40" : "border-gray-300"}`}
            >
              {projectTypes.map((pt) => (
                <option key={pt.id} value={pt.name}>
                  {pt.name}
                </option>
              ))}
            </select>
            {errors.project_type && (
              <p className="text-red-600 text-sm mt-1">{errors.project_type}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="task-tshirt-size"
              className="block text-sm font-medium mb-2 flex items-center gap-1.5"
            >
              <Ruler size={14} className="text-indigo-600" />
              Complejidad *
            </label>
            <select
              id="task-tshirt-size"
              name="tshirt_size"
              value={formData.tshirt_size}
              onChange={handleInputChange}
              className={`w-full border rounded-lg px-4 py-2 ${errors.tshirt_size ? "border-red-500 bg-red-950/40" : "border-gray-300"}`}
            >
              {complexities.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.tshirt_size && (
              <p className="text-red-600 text-sm mt-1">{errors.tshirt_size}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Sección 3: Periodo y Estado */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">
          Periodo y Estado
        </legend>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="task-month"
              className="block text-sm font-medium mb-2"
            >
              Mes *
            </label>
            <select
              id="task-month"
              name="month"
              value={formData.month}
              onChange={handleInputChange}
              className="w-full border rounded-lg px-4 py-2"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="task-year"
              className="block text-sm font-medium mb-2"
            >
              Año *
            </label>
            <select
              id="task-year"
              name="year"
              value={formData.year}
              onChange={handleInputChange}
              className="w-full border rounded-lg px-4 py-2"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="task-effort-date"
              className="block text-sm font-medium mb-2 flex items-center gap-1.5"
            >
              <Calendar size={14} className="text-green-600" />
              Fecha Esfuerzo *
            </label>
            <input
              id="task-effort-date"
              type="date"
              name="effort_score_date"
              value={formData.effort_score_date}
              onChange={handleInputChange}
              className={`w-full border rounded-lg px-4 py-2 ${errors.effort_score_date ? "border-red-500 bg-red-950/40" : "border-gray-300"}`}
            />
            {errors.effort_score_date && (
              <p className="text-red-600 text-sm mt-1">
                {errors.effort_score_date}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="task-status"
              className="block text-sm font-medium mb-2"
            >
              Estado *
            </label>
            <select
              id="task-status"
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="w-full border rounded-lg px-4 py-2"
              data-tour="task-status"
            >
              <option value="Pendiente">Pendiente</option>
              <option value="Completada">Completada</option>
              <option value="Deprecada">Deprecada</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* Squads Section */}
      <div
        className="border rounded-lg p-4 space-y-4"
        data-tour="task-form-squads"
      >
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Squads *</h3>
          {errors.squads && (
            <p className="text-red-600 text-sm">{errors.squads}</p>
          )}
        </div>

        {formData.squads.length > 0 ? (
          <div className="space-y-4">
            {formData.squads.map((squadData) => (
              <div
                key={squadData.squad}
                className="bg-gray-50 border rounded-lg p-4 space-y-3"
                data-testid={`squad-section-${squadData.squad}`}
              >
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">{squadData.squad}</h4>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveSquad(e, squadData.squad)}
                    className="text-red-600 hover:text-red-800 p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div
                  className="grid grid-cols-3 gap-3"
                  data-tour="task-form-returns"
                >
                  {/* Devoluciones Bajas */}
                  <div>
                    <label
                      htmlFor={`low-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                      className="block text-sm font-medium mb-2"
                    >
                      Bajas
                    </label>
                    <div className="flex items-center justify-center gap-1 bg-white border rounded-lg px-2 py-2">
                      <button
                        type="button"
                        onClick={(e) =>
                          handleDecrementReturns(
                            e,
                            squadData.squad,
                            "low_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Decrementar devoluciones bajas"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        id={`low-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                        type="number"
                        name={`low-returns-${squadData.squad}`}
                        value={
                          focusedReturnsField === `${squadData.squad}-low` &&
                          squadData.low_returns === 0
                            ? ""
                            : squadData.low_returns
                        }
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (inputValue === "" || /^\d+$/.test(inputValue)) {
                            handleUpdateSquadReturns(
                              squadData.squad,
                              "low_returns",
                              inputValue === "" ? 0 : parseInt(inputValue, 10),
                            );
                          }
                        }}
                        onKeyDown={(e) =>
                          handleReturnsKeyDown(
                            e,
                            squadData.squad,
                            "low_returns",
                          )
                        }
                        onFocus={() =>
                          setFocusedReturnsField(`${squadData.squad}-low`)
                        }
                        onBlur={() => setFocusedReturnsField(null)}
                        min="0"
                        className="w-12 border-none outline-none text-center py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        onClick={(e) =>
                          handleIncrementReturns(
                            e,
                            squadData.squad,
                            "low_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Incrementar devoluciones bajas"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Devoluciones Medias */}
                  <div>
                    <label
                      htmlFor={`medium-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                      className="block text-sm font-medium mb-2"
                    >
                      Medias
                    </label>
                    <div className="flex items-center justify-center gap-1 bg-white border rounded-lg px-2 py-2">
                      <button
                        type="button"
                        onClick={(e) =>
                          handleDecrementReturns(
                            e,
                            squadData.squad,
                            "medium_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Decrementar devoluciones medias"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        id={`medium-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                        type="number"
                        name={`medium-returns-${squadData.squad}`}
                        value={
                          focusedReturnsField === `${squadData.squad}-medium` &&
                          squadData.medium_returns === 0
                            ? ""
                            : squadData.medium_returns
                        }
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (inputValue === "" || /^\d+$/.test(inputValue)) {
                            handleUpdateSquadReturns(
                              squadData.squad,
                              "medium_returns",
                              inputValue === "" ? 0 : parseInt(inputValue, 10),
                            );
                          }
                        }}
                        onKeyDown={(e) =>
                          handleReturnsKeyDown(
                            e,
                            squadData.squad,
                            "medium_returns",
                          )
                        }
                        onFocus={() =>
                          setFocusedReturnsField(`${squadData.squad}-medium`)
                        }
                        onBlur={() => setFocusedReturnsField(null)}
                        min="0"
                        className="w-12 border-none outline-none text-center py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        onClick={(e) =>
                          handleIncrementReturns(
                            e,
                            squadData.squad,
                            "medium_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Incrementar devoluciones medias"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Devoluciones Graves */}
                  <div>
                    <label
                      htmlFor={`high-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                      className="block text-sm font-medium mb-2"
                    >
                      Graves
                    </label>
                    <div className="flex items-center justify-center gap-1 bg-white border rounded-lg px-2 py-2">
                      <button
                        type="button"
                        onClick={(e) =>
                          handleDecrementReturns(
                            e,
                            squadData.squad,
                            "high_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Decrementar devoluciones graves"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        id={`high-returns-${squadData.squad.replace(/\s+/g, "-")}`}
                        type="number"
                        name={`high-returns-${squadData.squad}`}
                        value={
                          focusedReturnsField === `${squadData.squad}-high` &&
                          squadData.high_returns === 0
                            ? ""
                            : squadData.high_returns
                        }
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (inputValue === "" || /^\d+$/.test(inputValue)) {
                            handleUpdateSquadReturns(
                              squadData.squad,
                              "high_returns",
                              inputValue === "" ? 0 : parseInt(inputValue, 10),
                            );
                          }
                        }}
                        onKeyDown={(e) =>
                          handleReturnsKeyDown(
                            e,
                            squadData.squad,
                            "high_returns",
                          )
                        }
                        onFocus={() =>
                          setFocusedReturnsField(`${squadData.squad}-high`)
                        }
                        onBlur={() => setFocusedReturnsField(null)}
                        min="0"
                        className="w-12 border-none outline-none text-center py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        onClick={(e) =>
                          handleIncrementReturns(
                            e,
                            squadData.squad,
                            "high_returns",
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        aria-label="Incrementar devoluciones graves"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Score para este squad */}
                <div
                  className="p-3 bg-blue-50 rounded border border-blue-200"
                  data-tour="task-calculated-score"
                >
                  <p className="text-sm text-gray-600">
                    Nota calculada:{" "}
                    <span className="font-bold text-lg">
                      {formatScore(
                        calculateTaskScore({
                          lowReturns: squadData.low_returns,
                          mediumReturns: squadData.medium_returns,
                          highReturns: squadData.high_returns,
                        }),
                      )}
                      /10
                    </span>
                  </p>
                </div>

                {/* Notas Adicionales por Squad */}
                <div>
                  <label
                    htmlFor={`notes-${squadData.squad.replace(/\s+/g, "-")}`}
                    className="block text-sm font-medium mb-2"
                  >
                    Notas Adicionales
                  </label>
                  <textarea
                    id={`notes-${squadData.squad.replace(/\s+/g, "-")}`}
                    value={squadData.additional_notes || ""}
                    onChange={(e) =>
                      handleUpdateSquadNotes(squadData.squad, e.target.value)
                    }
                    rows={3}
                    className="w-full border rounded-lg px-4 py-2 bg-white"
                    placeholder="Contexto adicional para la IA..."
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-4">
            No hay squads seleccionados
          </p>
        )}

        {/* Add Squad Button */}
        {availableSquadsToAdd.length > 0 && (
          <div className="pt-4 border-t">
            <label htmlFor="add-squad-select" className="sr-only">
              Agregar otro squad
            </label>
            <select
              id="add-squad-select"
              onChange={(e) => {
                if (e.target.value) {
                  handleAddSquad(e.target.value);
                  e.target.value = "";
                }
              }}
              className="w-full border rounded-lg px-4 py-2"
              aria-label="Agregar otro squad"
            >
              <option value="">+ Agregar otro squad</option>
              {availableSquadsToAdd.map((squadName) => (
                <option key={squadName} value={squadName}>
                  {squadName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* QA Asignados Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label
            htmlFor="qa-task-selector-button"
            className="block text-sm font-semibold flex items-center gap-2"
          >
            <Users size={18} className="text-blue-600" />
            QA Asignados *
          </label>
          <span className="text-xs text-gray-500">
            {formData.assigned_qa.length} seleccionado
            {formData.assigned_qa.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="relative" ref={qaDropdownRef}>
          <button
            id="qa-task-selector-button"
            type="button"
            onClick={() => setShowQASelector(!showQASelector)}
            className="w-full flex items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left hover:border-blue-400 transition-colors"
            aria-expanded={showQASelector}
            aria-controls="qa-task-selector-options"
          >
            <div className="flex flex-wrap gap-1.5 flex-1">
              {formData.assigned_qa.length === 0 ? (
                <span className="text-gray-400 text-sm">
                  Selecciona uno o más QA...
                </span>
              ) : (
                formData.assigned_qa.map((qaName) => (
                  <span
                    key={qaName}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-blue-400 bg-blue-50"
                  >
                    {qaName}
                    <div
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeQA(qaName);
                      }}
                      className="hover:text-red-600 ml-0.5 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.stopPropagation();
                          removeQA(qaName);
                        }
                      }}
                    >
                      <X size={12} />
                    </div>
                  </span>
                ))
              )}
            </div>
            <ChevronDown
              size={18}
              className={`text-gray-400 transition-transform ${showQASelector ? "rotate-180" : ""}`}
            />
          </button>

          {showQASelector && (
            <div
              id="qa-task-selector-options"
              className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto"
              role="listbox"
            >
              {qaMembers.map((qa) => {
                const isSelected = formData.assigned_qa.includes(qa.name);
                return (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() => toggleQA(qa.name)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 ${isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300"}`}
                    >
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <span
                      className={
                        isSelected
                          ? "font-medium text-blue-700"
                          : "text-gray-700"
                      }
                    >
                      {qa.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Los QA asignados se preseleccionarán al registrar tiempos
        </p>
        {errors.assigned_qa && (
          <p className="text-red-600 text-sm mt-1">{errors.assigned_qa}</p>
        )}
      </div>

      {errors.submit && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3"
          role="alert"
          data-testid="task-form-error"
        >
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{errors.submit}</p>
        </div>
      )}

      <div className="flex gap-4 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelWithConfirm}
            disabled={localSubmitting || isLoading}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={localSubmitting || isLoading || !isFormValid()}
        >
          {localSubmitting || isLoading ? "Guardando..." : "Guardar Tarea"}
        </Button>

        {unsavedConfirm && (
          <>
            <div
              className="fixed inset-0 backdrop-blur-sm z-40"
              onClick={() => {
                setUnsavedConfirm(false);
                setPendingAction(null);
              }}
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
                <h3 className="text-lg font-semibold mb-2">
                  Cambios sin guardar
                </h3>
                <p className="text-gray-600 mb-6">
                  Tienes cambios sin guardar. ¿Deseas descartar los cambios?
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setUnsavedConfirm(false);
                      setPendingAction(null);
                    }}
                    className="flex-1 whitespace-nowrap"
                  >
                    Continuar editando
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setUnsavedConfirm(false);
                      pendingAction?.();
                    }}
                    className="flex-1 whitespace-nowrap"
                  >
                    Descartar cambios
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </form>
  );
}

const TaskForm = forwardRef(TaskFormComponent);
TaskForm.displayName = "TaskForm";

export default TaskForm;
