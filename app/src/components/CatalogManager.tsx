'use client';

import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import { useSafeAuthFetch } from '@/hooks/useSafeAuthFetch';
import { invalidateCatalogCache } from '@/hooks/useCatalogData';

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
  type: 'text' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  description?: string;
}

interface CatalogManagerProps {
  title: string;
  apiPath: string;
  items: CatalogItem[];
  fields: FieldDef[];
  onRefresh: () => void;
  /** Columnas adicionales a mostrar en la tabla (aparte de nombre y estado) */
  extraColumns?: { header: string; render: (item: CatalogItem) => React.ReactNode }[];
  /** Nombre amigable del plural (para mensajes) */
  itemLabel?: string;
}

type FormValues = Record<string, string | number | boolean>;

function buildEmptyForm(fields: FieldDef[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    v[f.key] = f.type === 'number' ? 0 : '';
  }
  return v;
}

function buildFormFromItem(item: CatalogItem, fields: FieldDef[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    v[f.key] = (item[f.key] as string | number | boolean) ?? (f.type === 'number' ? 0 : '');
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
  itemLabel = 'elemento',
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

  // ─── Form helpers ───────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingItem(null);
    setFormValues(buildEmptyForm(fields));
    setFormError(null);
    setShowModal(true);
  }, [fields]);

  const openEdit = useCallback(
    (item: CatalogItem) => {
      setEditingItem(item);
      setFormValues(buildFormFromItem(item, fields));
      setFormError(null);
      setShowModal(true);
    },
    [fields]
  );

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingItem(null);
    setFormError(null);
  }, []);

  const handleFieldChange = useCallback((key: string, value: string | number) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // Validar campos requeridos
    for (const f of fields) {
      if (f.required !== false) {
        const val = formValues[f.key];
        if (val === '' || val === null || val === undefined) {
          setFormError(`El campo "${f.label}" es requerido`);
          return;
        }
      }
    }

    setSaving(true);
    setFormError(null);

    try {
      const url = editingItem ? `${apiPath}/${editingItem.id}` : apiPath;
      const method = editingItem ? 'PATCH' : 'POST';

      const res = await safeFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error ?? 'Error al guardar');
        return;
      }

      invalidateCatalogCache();
      onRefresh();
      closeModal();
    } catch {
      setFormError('Error de conexión. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }, [editingItem, fields, formValues, apiPath, safeFetch, onRefresh, closeModal]);

  // ─── Toggle activo/inactivo ──────────────────────────────────────────────────

  const handleToggleActive = useCallback(
    async (item: CatalogItem) => {
      setToggling(item.id);
      try {
        const res = await safeFetch(`${apiPath}/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
    [apiPath, safeFetch, onRefresh]
  );

  // ─── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string) => {
      setDeleting(true);
      setDeleteError(null);
      try {
        const res = await safeFetch(`${apiPath}/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          setDeleteError(data.error ?? 'Error al eliminar');
          return;
        }
        invalidateCatalogCache();
        onRefresh();
        setDeleteConfirm(null);
      } catch {
        setDeleteError('Error de conexión. Intenta de nuevo.');
      } finally {
        setDeleting(false);
      }
    },
    [apiPath, safeFetch, onRefresh]
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
                <th key={col.header} className="px-4 py-3 text-left">{col.header}</th>
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
                <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${!item.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  {extraColumns.map((col) => (
                    <td key={col.header} className="px-4 py-3 text-gray-600">
                      {col.render(item)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(item)}
                      disabled={toggling === item.id}
                      title={item.is_active ? 'Desactivar' : 'Activar'}
                      className="inline-flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-40"
                    >
                      {item.is_active
                        ? <ToggleRight size={22} className="text-blue-500" />
                        : <ToggleLeft size={22} />
                      }
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
                        onClick={() => { setDeleteConfirm(item.id); setDeleteError(null); }}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
                        title="Eliminar"
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
        size="md"
      >
        <div className="space-y-4 p-1">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required !== false && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.description && (
                <p className="text-xs text-gray-500 mb-1">{field.description}</p>
              )}
              {field.type === 'select' ? (
                <select
                  value={String(formValues[field.key] ?? '')}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={String(formValues[field.key] ?? '')}
                  onChange={(e) =>
                    handleFieldChange(
                      field.key,
                      field.type === 'number' ? Number(e.target.value) : e.target.value
                    )
                  }
                  min={field.min}
                  placeholder={field.placeholder ?? ''}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}

          {formError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : (
                <>
                  <Check size={15} className="mr-1" />
                  {editingItem ? 'Guardar cambios' : 'Crear'}
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
        onClose={() => { setDeleteConfirm(null); setDeleteError(null); }}
        size="sm"
      >
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-700">
            ¿Eliminar <strong>{itemToDelete?.name}</strong>? Esta acción no se puede deshacer.
            Si está en uso en tareas existentes, la eliminación será bloqueada.
          </p>

          {deleteError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{deleteError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
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
              {deleting ? 'Eliminando...' : (
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
