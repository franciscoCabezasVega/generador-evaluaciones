"use client";

import React, { useState, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { useSafeAuthFetch } from "@/hooks/useSafeAuthFetch";
import { invalidateCatalogCache } from "@/hooks/useCatalogData";

// ─── Tipos genéricos ──────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  is_active: boolean;
  [key: string]: unknown;
}

export interface FieldDef {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "select"
    | "color"
    | "toggle"
    | "time"
    | "multi-day"
    | "date-range-list";
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /**
   * Función que devuelve las opciones del select basadas en el estado actual
   * del formulario. Tiene precedencia sobre `options` cuando está definida.
   */
  optionsFn?: (formValues: FormValues) => { value: string; label: string }[];
  /**
   * Al cambiar este campo, retorna un parche parcial que se aplica al form.
   * Útil para campos dependientes (ej: al cambiar país → resetear ciudad).
   */
  cascadeOnChange?: (
    newValue: string | number | boolean,
    formValues: FormValues,
  ) => Partial<FormValues>;
  /** Si true, el campo se mantiene en formValues pero no se renderiza. */
  hidden?: boolean;
  min?: number;
  description?: string;
  /**
   * Solo para type="date-range-list": path de la sub-API.
   * Recibe el id del item padre y retorna la URL del sub-recurso.
   * Ejemplo: (id) => `/api/settings/qa-members/${id}/oo`
   */
  subApiPath?: (itemId: string) => string;
}

/** Nombres de días de la semana por número ISO (1=Lun, 7=Dom). */
const ISO_DAY_LABELS: Record<number, string> = {
  1: "Lu",
  2: "Ma",
  3: "Mi",
  4: "Ju",
  5: "Vi",
  6: "Sá",
  7: "Do",
};

interface OOORangeItem {
  id: string;
  date_from: string;
  date_to: string;
  reason?: string | null;
}

interface CatalogManagerProps {
  title: string;
  apiPath: string;
  items: CatalogItem[];
  fields: FieldDef[];
  onRefresh: () => void;
  /** Columnas adicionales a mostrar en la tabla (aparte de nombre y estado) */
  extraColumns?: {
    header: string;
    render: (item: CatalogItem) => React.ReactNode;
  }[];
  /** Nombre amigable del plural (para mensajes) */
  itemLabel?: string;
  /** Si retorna true para un item, el botón eliminar queda deshabilitado */
  isProtected?: (item: CatalogItem) => boolean;
  /** Tooltip para el botón eliminar cuando el item está protegido */
  protectedMessage?: string;
  /**
   * Agrupa los campos del modal en secciones con título.
   * Campos no referenciados en ninguna sección no se muestran.
   */
  sections?: { title: string; fieldKeys: string[] }[];
}

type FormValues = Record<string, string | number | boolean | number[]>;

function buildEmptyForm(fields: FieldDef[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    if (f.type === "number") v[f.key] = 0;
    else if (f.type === "toggle") v[f.key] = false;
    else if (f.type === "multi-day") v[f.key] = [1, 2, 3, 4, 5];
    else if (f.type === "date-range-list") {
      /* manejado por oooItems */
    } else v[f.key] = "";
  }
  return v;
}

function buildFormFromItem(item: CatalogItem, fields: FieldDef[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    if (f.type === "date-range-list") continue; // manejado por oooItems
    if (f.type === "multi-day") {
      const raw = item[f.key];
      v[f.key] = Array.isArray(raw) ? (raw as number[]) : [1, 2, 3, 4, 5];
    } else if (f.type === "time") {
      // DB retorna "HH:MM:SS", input[type=time] espera "HH:MM"
      const raw = (item[f.key] as string) ?? "";
      v[f.key] = raw.substring(0, 5);
    } else {
      v[f.key] =
        (item[f.key] as string | number | boolean) ??
        (f.type === "number" ? 0 : "");
    }
  }
  return v;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CatalogManager({
  title,
  apiPath,
  items,
  fields,
  onRefresh,
  extraColumns = [],
  itemLabel = "elemento",
  isProtected,
  protectedMessage = "Este elemento del sistema no puede eliminarse",
  sections,
}: CatalogManagerProps) {
  const { safeFetch } = useSafeAuthFetch();

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Estado para sub-recursos tipo date-range-list (e.g. OOO periods)
  const [oooItems, setOooItems] = useState<Record<string, OOORangeItem[]>>({});
  const [loadingOoo, setLoadingOoo] = useState(false);
  const [newOoo, setNewOoo] = useState({
    date_from: "",
    date_to: "",
    reason: "",
  });
  const [addingOoo, setAddingOoo] = useState(false);
  const [oooFieldError, setOooFieldError] = useState<string | null>(null);

  // ─── Form helpers ───────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingItem(null);
    setFormValues(buildEmptyForm(fields));
    setFormError(null);
    setOooItems({});
    setNewOoo({ date_from: "", date_to: "", reason: "" });
    setOooFieldError(null);
    setShowModal(true);
  }, [fields]);

  const openEdit = useCallback(
    async (item: CatalogItem) => {
      setEditingItem(item);
      setFormValues(buildFormFromItem(item, fields));
      setFormError(null);
      setOooItems({});
      setNewOoo({ date_from: "", date_to: "", reason: "" });
      setOooFieldError(null);
      setShowModal(true);

      // Cargar sub-recursos date-range-list (e.g. OOO periods)
      const drFields = fields.filter(
        (f) => f.type === "date-range-list" && f.subApiPath,
      );
      if (drFields.length > 0) {
        setLoadingOoo(true);
        try {
          const results = await Promise.all(
            drFields.map(async (f) => {
              const url = f.subApiPath!(item.id);
              const res = await safeFetch(url, { method: "GET" });
              if (!res.ok) return { key: f.key, items: [] as OOORangeItem[] };
              const data = await res.json();
              const arr: OOORangeItem[] = Array.isArray(data)
                ? data
                : (data.items ?? []);
              return { key: f.key, items: arr };
            }),
          );
          const newMap: Record<string, OOORangeItem[]> = {};
          for (const r of results) newMap[r.key] = r.items;
          setOooItems(newMap);
        } catch {
          // silencioso: lista OOO aparece vacía pero no bloquea la edición
        } finally {
          setLoadingOoo(false);
        }
      }
    },
    [fields, safeFetch],
  );

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingItem(null);
    setFormError(null);
    setOooItems({});
    setNewOoo({ date_from: "", date_to: "", reason: "" });
    setOooFieldError(null);
  }, []);

  const handleFieldChange = useCallback(
    (key: string, value: string | number | boolean) => {
      setFormValues((prev) => {
        const updated = { ...prev, [key]: value };
        const field = fields.find((f) => f.key === key);
        if (field?.cascadeOnChange) {
          const patch = field.cascadeOnChange(value, updated);
          // Filtrar undefined para respetar el tipo FormValues
          const cleanPatch = Object.fromEntries(
            Object.entries(patch).filter(([, v]) => v !== undefined),
          ) as FormValues;
          return { ...updated, ...cleanPatch };
        }
        return updated;
      });
    },
    [fields],
  );

  const handleMultiDayToggle = useCallback((key: string, day: number) => {
    setFormValues((prev) => {
      const current = (prev[key] as number[]) ?? [];
      const updated = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { ...prev, [key]: updated };
    });
  }, []);

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // Validar campos requeridos (excluye date-range-list)
    for (const f of fields) {
      if (f.type === "date-range-list") continue;
      if (f.required !== false) {
        const val = formValues[f.key];
        if (val === "" || val === null || val === undefined) {
          setFormError(`El campo "${f.label}" es requerido`);
          return;
        }
      }
    }

    setSaving(true);
    setFormError(null);

    try {
      const url = editingItem ? `${apiPath}/${editingItem.id}` : apiPath;
      const method = editingItem ? "PATCH" : "POST";

      // Construir body excluyendo date-range-list (sub-recurso independiente)
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(formValues)) {
        const field = fields.find((f) => f.key === k);
        if (field?.type === "date-range-list") continue;
        body[k] = v;
      }

      const res = await safeFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? "Error al guardar");
        return;
      }

      invalidateCatalogCache();
      onRefresh();
      closeModal();
    } catch {
      setFormError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [
    editingItem,
    fields,
    formValues,
    apiPath,
    safeFetch,
    onRefresh,
    closeModal,
  ]);

  // ─── OOO handlers ────────────────────────────────────────────────────────────

  const handleAddOoo = useCallback(
    async (fieldKey: string, subPath: string) => {
      if (!newOoo.date_from || !newOoo.date_to) {
        setOooFieldError("Fecha inicio y fin son requeridas");
        return;
      }
      if (newOoo.date_to < newOoo.date_from) {
        setOooFieldError(
          "La fecha fin no puede ser anterior a la fecha inicio",
        );
        return;
      }
      setAddingOoo(true);
      setOooFieldError(null);
      try {
        const res = await safeFetch(subPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newOoo),
        });
        const data = await res.json();
        if (!res.ok) {
          setOooFieldError(data.error ?? "Error al agregar período");
          return;
        }
        setOooItems((prev) => ({
          ...prev,
          [fieldKey]: [...(prev[fieldKey] ?? []), data as OOORangeItem],
        }));
        setNewOoo({ date_from: "", date_to: "", reason: "" });
      } catch {
        setOooFieldError("Error de conexión");
      } finally {
        setAddingOoo(false);
      }
    },
    [newOoo, safeFetch],
  );

  const handleDeleteOoo = useCallback(
    async (fieldKey: string, subPath: string, ooId: string) => {
      try {
        const res = await safeFetch(`${subPath}?ooId=${ooId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setOooItems((prev) => ({
            ...prev,
            [fieldKey]: (prev[fieldKey] ?? []).filter((o) => o.id !== ooId),
          }));
        }
      } catch {
        // silencioso
      }
    },
    [safeFetch],
  );

  // ─── Toggle activo/inactivo ──────────────────────────────────────────────────

  const handleToggleActive = useCallback(
    async (item: CatalogItem) => {
      setToggling(item.id);
      try {
        const res = await safeFetch(`${apiPath}/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !item.is_active }),
        });
        if (res.ok) {
          invalidateCatalogCache();
          onRefresh();
        }
      } catch {
        // silencioso
      } finally {
        setToggling(null);
      }
    },
    [apiPath, safeFetch, onRefresh],
  );

  // ─── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(true);
      setDeleteError(null);
      try {
        const res = await safeFetch(`${apiPath}/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          setDeleteError(data.error ?? "Error al eliminar");
          return;
        }
        invalidateCatalogCache();
        onRefresh();
        setDeleteConfirm(null);
      } catch {
        setDeleteError("Error de conexión. Intenta de nuevo.");
      } finally {
        setDeleting(false);
      }
    },
    [apiPath, safeFetch, onRefresh],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  const itemToDelete = items.find((i) => i.id === deleteConfirm);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} className="mr-1" />
          Nuevo
        </Button>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              {extraColumns.map((col) => (
                <th key={col.header} className="px-4 py-3 text-left">
                  {col.header}
                </th>
              ))}
              <th className="px-4 py-3 text-center">Activo</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + extraColumns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No hay {itemLabel}s registrados
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 transition-colors ${!item.is_active ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.name}
                  </td>
                  {extraColumns.map((col) => (
                    <td key={col.header} className="px-4 py-3 text-gray-600">
                      {col.render(item)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(item)}
                      disabled={toggling === item.id}
                      title={item.is_active ? "Desactivar" : "Activar"}
                      className="inline-flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-40"
                    >
                      {item.is_active ? (
                        <ToggleRight size={22} className="text-blue-500" />
                      ) : (
                        <ToggleLeft size={22} />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteConfirm(item.id);
                          setDeleteError(null);
                        }}
                        disabled={isProtected?.(item) ?? false}
                        className={`p-1.5 rounded transition-colors ${
                          isProtected?.(item)
                            ? "text-gray-300 cursor-not-allowed"
                            : "hover:bg-red-50 text-gray-500 hover:text-red-600"
                        }`}
                        title={
                          isProtected?.(item) ? protectedMessage : "Eliminar"
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={showModal}
        title={editingItem ? `Editar ${itemLabel}` : `Nuevo ${itemLabel}`}
        onClose={closeModal}
        size={sections && sections.length > 0 ? "lg" : "md"}
      >
        <div className="space-y-4 p-1">
          {(() => {
            // Renderer de un campo individual del formulario
            const renderFieldInput = (field: FieldDef) => {
              if (field.hidden) return null;
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required !== false &&
                      field.type !== "date-range-list" && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                  </label>
                  {field.description && (
                    <p className="text-xs text-gray-500 mb-1">
                      {field.description}
                    </p>
                  )}
                  {field.type === "select" ? (
                    <select
                      value={String(formValues[field.key] ?? "")}
                      onChange={(e) =>
                        handleFieldChange(field.key, e.target.value)
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      {(field.optionsFn
                        ? field.optionsFn(formValues)
                        : (field.options ?? [])
                      ).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "color" ? (
                    <div className="flex items-center gap-2">
                      <label
                        className="relative flex-shrink-0 w-10 h-10 rounded-lg border border-gray-300 overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                        title="Abrir selector de color"
                      >
                        <span
                          className="absolute inset-0 block"
                          style={{
                            backgroundColor: String(
                              formValues[field.key] || "#000000",
                            ),
                          }}
                        />
                        <input
                          type="color"
                          value={String(formValues[field.key] || "#000000")}
                          onChange={(e) =>
                            handleFieldChange(field.key, e.target.value)
                          }
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          tabIndex={-1}
                        />
                      </label>
                      <input
                        type="text"
                        value={String(formValues[field.key] ?? "")}
                        onChange={(e) =>
                          handleFieldChange(field.key, e.target.value)
                        }
                        placeholder="#10B981"
                        maxLength={7}
                        spellCheck={false}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  ) : field.type === "toggle" ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleFieldChange(field.key, !formValues[field.key])
                      }
                      className="flex items-center gap-2 text-sm"
                    >
                      {formValues[field.key] ? (
                        <ToggleRight size={28} className="text-blue-500" />
                      ) : (
                        <ToggleLeft size={28} className="text-gray-400" />
                      )}
                      <span className="text-gray-700">
                        {formValues[field.key] ? "Sí" : "No"}
                      </span>
                    </button>
                  ) : field.type === "multi-day" ? (
                    <div className="flex gap-1 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                        const selected = (
                          (formValues[field.key] as number[]) ?? []
                        ).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleMultiDayToggle(field.key, day)}
                            className={`w-9 h-9 rounded-full text-xs font-medium border transition-colors ${
                              selected
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                            }`}
                            title={ISO_DAY_LABELS[day]}
                          >
                            {ISO_DAY_LABELS[day]}
                          </button>
                        );
                      })}
                    </div>
                  ) : field.type === "date-range-list" ? (
                    <div className="space-y-2">
                      {/* Lista existente */}
                      {loadingOoo ? (
                        <p className="text-xs text-gray-400">Cargando...</p>
                      ) : (oooItems[field.key] ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400 italic">
                          Sin períodos registrados
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100 border rounded-lg overflow-hidden text-sm">
                          {(oooItems[field.key] ?? []).map((ooo) => (
                            <li
                              key={ooo.id}
                              className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50"
                            >
                              <div>
                                <span className="font-mono text-xs">
                                  {ooo.date_from} → {ooo.date_to}
                                </span>
                                {ooo.reason && (
                                  <span className="ml-2 text-gray-400 text-xs">
                                    ({ooo.reason})
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  editingItem &&
                                  field.subApiPath &&
                                  handleDeleteOoo(
                                    field.key,
                                    field.subApiPath(editingItem.id),
                                    ooo.id,
                                  )
                                }
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                title="Eliminar período"
                              >
                                <X size={14} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Formulario agregar nuevo OOO (solo en modo edición) */}
                      {editingItem && field.subApiPath && (
                        <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                          <p className="text-xs font-medium text-gray-600">
                            Agregar período
                          </p>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-xs text-gray-500">
                                Inicio
                              </label>
                              <input
                                type="date"
                                value={newOoo.date_from}
                                onChange={(e) =>
                                  setNewOoo((p) => ({
                                    ...p,
                                    date_from: e.target.value,
                                  }))
                                }
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-gray-500">
                                Fin
                              </label>
                              <input
                                type="date"
                                value={newOoo.date_to}
                                onChange={(e) =>
                                  setNewOoo((p) => ({
                                    ...p,
                                    date_to: e.target.value,
                                  }))
                                }
                                className="w-full border rounded px-2 py-1 text-sm"
                              />
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="Motivo (opcional)"
                            value={newOoo.reason}
                            onChange={(e) =>
                              setNewOoo((p) => ({
                                ...p,
                                reason: e.target.value,
                              }))
                            }
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                          {oooFieldError && (
                            <p className="text-xs text-red-600">
                              {oooFieldError}
                            </p>
                          )}
                          <Button
                            size="sm"
                            onClick={() =>
                              field.subApiPath &&
                              handleAddOoo(
                                field.key,
                                field.subApiPath(editingItem.id),
                              )
                            }
                            disabled={addingOoo}
                          >
                            <Plus size={13} className="mr-1" />
                            {addingOoo ? "Guardando..." : "Agregar"}
                          </Button>
                        </div>
                      )}
                      {!editingItem && (
                        <p className="text-xs text-gray-400 italic">
                          Guarda el registro primero para agregar períodos.
                        </p>
                      )}
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      value={String(formValues[field.key] ?? "")}
                      onChange={(e) =>
                        handleFieldChange(
                          field.key,
                          field.type === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      min={field.min}
                      placeholder={field.placeholder ?? ""}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                </div>
              );
            };

            // Si se definen secciones, agrupar los campos por sección (2 cols)
            if (sections && sections.length > 0) {
              return sections.map((section) => {
                const sectionFields = section.fieldKeys
                  .map((k) => fields.find((f) => f.key === k))
                  .filter((f): f is FieldDef => !!f && !f.hidden);
                return (
                  <div key={section.title} className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-1">
                      {section.title}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                      {sectionFields.map((f) => (
                        <div
                          key={f.key}
                          className={
                            f.type === "date-range-list" ||
                            f.type === "multi-day" ||
                            f.type === "toggle"
                              ? "sm:col-span-2"
                              : ""
                          }
                        >
                          {renderFieldInput(f)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            }

            // Sin secciones: render plano de todos los campos
            return fields.filter((f) => !f.hidden).map(renderFieldInput);
          })()}

          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle
                size={16}
                className="text-red-500 mt-0.5 flex-shrink-0"
              />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                "Guardando..."
              ) : (
                <>
                  <Check size={15} className="mr-1" />
                  {editingItem ? "Guardar cambios" : "Crear"}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={deleteConfirm !== null}
        title="Confirmar eliminación"
        onClose={() => {
          setDeleteConfirm(null);
          setDeleteError(null);
        }}
        size="sm"
      >
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-700">
            ¿Eliminar <strong>{itemToDelete?.name}</strong>? Esta acción no se
            puede deshacer. Si está en uso en tareas existentes, la eliminación
            será bloqueada.
          </p>

          {deleteError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle
                size={16}
                className="text-red-500 mt-0.5 flex-shrink-0"
              />
              <p className="text-sm text-red-700">{deleteError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirm(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              <X size={15} className="mr-1" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleting}
            >
              {deleting ? (
                "Eliminando..."
              ) : (
                <>
                  <Trash2 size={15} className="mr-1" />
                  Eliminar
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
