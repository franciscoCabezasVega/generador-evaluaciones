'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSafeAuthFetch } from '@/hooks/useSafeAuthFetch';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { formatScore } from '@/lib/scoreCalculator';
import Navbar from '@/components/Navbar';
import TaskForm from '@/components/TaskForm';
import CacheWarningBanner from '@/components/CacheWarningBanner';
import Modal from '@/components/Modal';
import { SkeletonTable } from '@/components/Skeleton';
import { Task, CreateTaskInput } from '@/lib/types';
import { useCatalogData } from '@/hooks/useCatalogData';
import { Button } from '@/components/ui/button';
import { Trash2, Edit2, ChevronDown, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMutationQueue } from '@/contexts/MutationQueueContext';

type TaskWithSquads = Task & {
  squads?: Array<{
    squad: string;
    low_returns: number;
    medium_returns: number;
    high_returns: number;
    calculated_score: number;
    additional_notes?: string;
  }>;
};

export default function TasksPage() {
  const [submitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithSquads | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const formRef = useRef<{ handleCancelWithConfirm: () => void }>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isClient] = useState(() => typeof window !== 'undefined');

  const filters = useMemo(() => ({
    month: searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1,
    year: searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear(),
    productType: searchParams.get('productType') || '',
    squad: searchParams.get('squad') || '',
    status: searchParams.get('status') || '',
  }), [searchParams]);
  const { user, profile, loading: authLoading } = useAuth();
  const { safeFetch } = useSafeAuthFetch();
  const { enqueue } = useMutationQueue();

  // Redirigir a login si no hay sesión
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  // ===== Data fetching con caché en memoria =====
  const {
    data: tasks,
    loading,
    error: fetchError,
    isRefreshing,
    refresh: handleRefresh,
    invalidate: invalidateTasks,
    setData: setTasks,
  } = useCachedFetch<TaskWithSquads[]>({
    cacheKey: 'tasks',
    fetchFn: useCallback(async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (filters.month) params.append('month', filters.month.toString());
      if (filters.year) params.append('year', filters.year.toString());
      if (filters.productType) params.append('product_type', filters.productType);
      if (filters.squad) params.append('squad', filters.squad);
      if (filters.status) params.append('status', filters.status);

      const response = await safeFetch(`/api/tasks?${params.toString()}`, { signal });
      if (!response.ok) throw new Error('Error al cargar tareas');
      return await response.json();
    }, [filters, safeFetch]),
    filters,
    enabled: !authLoading && !!user,
    initialData: [],
  });

  const hasError = !!fetchError;

  // Auto-open edit modal if ?edit=<taskId> is in the URL
  const pendingEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      pendingEditIdRef.current = editId;
    }
  }, [searchParams]);

  useEffect(() => {
    if (!pendingEditIdRef.current || loading || tasks.length === 0) return;
    const task = tasks.find(t => t.id === pendingEditIdRef.current);
    if (task) {
      setEditingTask(task);
      setShowForm(true);
      pendingEditIdRef.current = null;
      // Clean edit param from URL
      if (isClient) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('edit');
        router.replace(`/tasks?${params.toString()}`, { scroll: false });
      }
    }
  }, [tasks, loading, isClient, searchParams, router]);

  // Función para actualizar filtros y URL
  const updateFilters = (newFilters: Partial<typeof filters>) => {
    const updatedFilters = { ...filters, ...newFilters };

    const params = new URLSearchParams();
    if (updatedFilters.month) params.set('month', updatedFilters.month.toString());
    if (updatedFilters.year) params.set('year', updatedFilters.year.toString());
    if (updatedFilters.productType) params.set('productType', updatedFilters.productType);
    if (updatedFilters.squad) params.set('squad', updatedFilters.squad);
    if (updatedFilters.status) params.set('status', updatedFilters.status);

    router.push(`/tasks?${params.toString()}`, { scroll: false });
  };

  const handleSubmit = async (data: CreateTaskInput) => {
    // ── Pre-flight: verificar link duplicado ANTES del optimistic update ──────
    // Si falla, lanza un error para que TaskForm lo muestre sin cerrar el form.
    const checkRes = await safeFetch(
      `/api/tasks/check-link?link=${encodeURIComponent(data.task_link)}${editingTask ? `&excludeId=${editingTask.id}` : ''}`,
      { method: 'GET' }
    );
    if (checkRes.status === 409) {
      const body = await checkRes.json().catch(() => ({}));
      throw new Error(body.error ?? 'Este link ya está en uso por otra tarea. Usa un link diferente.');
    }

    if (editingTask) {
      // ── EDICIÓN: actualización optimista inmediata ──────────────────────────
      const originalTask = editingTask;
      const optimisticTask: TaskWithSquads = {
        ...editingTask,
        name: data.name,
        task_link: data.task_link,
        product_type: data.product_type,
        status: data.status,
        month: data.month,
        year: data.year,
        assigned_qa: data.assigned_qa,
        effort_score_date: data.effort_score_date,
        tshirt_size: data.tshirt_size,
        category: data.category,
        squads: data.squads.map((sq) => ({
          squad: sq.squad,
          low_returns: sq.low_returns,
          medium_returns: sq.medium_returns,
          high_returns: sq.high_returns,
          calculated_score:
            editingTask.squads?.find((s) => s.squad === sq.squad)?.calculated_score ?? 0,
          additional_notes: sq.additional_notes,
        })),
      };

      // Reflejar cambios en la UI de inmediato (sin esperar la API)
      setTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? optimisticTask : t))
      );
      setShowForm(false);
      setEditingTask(null);

      enqueue({
        url: `/api/tasks/${editingTask.id}`,
        method: 'PATCH',
        body: data,
        cacheKeys: ['tasks'],
        onSuccess: () => {
          // Refrescar con datos reales (por ej. calculated_score actualizado)
          invalidateTasks();
        },
        onRollback: () => {
          // Restaurar el estado original si la mutación falla permanentemente
          setTasks((prev) =>
            prev.map((t) => (t.id === originalTask.id ? originalTask : t))
          );
        },
      });
    } else {
      // ── CREACIÓN: actualización optimista inmediata ─────────────────────────
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const optimisticTask: TaskWithSquads = {
        id: tempId,
        user_id: user!.id,
        name: data.name,
        task_link: data.task_link,
        product_type: data.product_type,
        status: data.status,
        month: data.month,
        year: data.year,
        assigned_qa: data.assigned_qa,
        effort_score_date: data.effort_score_date,
        tshirt_size: data.tshirt_size,
        category: data.category,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        squads: data.squads.map((sq) => ({
          squad: sq.squad,
          low_returns: sq.low_returns,
          medium_returns: sq.medium_returns,
          high_returns: sq.high_returns,
          calculated_score: 0,
          additional_notes: sq.additional_notes,
        })),
      };

      // Añadir la tarea al inicio de la lista inmediatamente
      setTasks((prev) => [optimisticTask, ...prev]);
      setShowForm(false);

      enqueue({
        url: '/api/tasks',
        method: 'POST',
        body: data,
        cacheKeys: ['tasks'],
        onSuccess: () => {
          // Reemplazar el ítem optimista con los datos reales del servidor
          invalidateTasks();
        },
        onRollback: () => {
          // Quitar el ítem optimista si la mutación falla permanentemente
          setTasks((prev) => prev.filter((t) => t.id !== tempId));
        },
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro?')) return;

    // Optimistic update: quitar de la lista inmediatamente
    setTasks((prev) => prev.filter((t) => t.id !== id));

    enqueue({
      url: `/api/tasks/${id}`,
      method: 'DELETE',
      cacheKeys: ['tasks'],
      onRollback: () => {
        // Restaurar la lista si el DELETE falla permanentemente
        invalidateTasks();
      },
    });
  };

  const canManageTasks = profile && ['admin', 'gestor'].includes(profile.role);

  // Squads dinámicos según el tipo de producto seleccionado
  const { products, squads: allSquads } = useCatalogData();

  const productObj = products.find((p) => p.name === filters.productType);
  const availableSquads = productObj
    ? allSquads.filter((s) => s.product_id === productObj.id).map((s) => s.name)
    : [];

  // Manejador para validar cambios sin guardar al cerrar desde el icono X
  const handleFormHeaderClose = () => {
    // Llamar al método del TaskForm que valida cambios sin guardar
    formRef.current?.handleCancelWithConfirm();
  };

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CacheWarningBanner />
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tareas</h1>
          {canManageTasks && !showForm && (
            <Button onClick={() => setShowForm(true)} data-tour="task-create-btn">
              + Nueva Tarea
            </Button>
          )}
        </div>

        {authLoading ? (
          <div className="bg-blue-100 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-600">
              Cargando permisos...
            </p>
          </div>
        ) : !canManageTasks && (
          <div className="bg-amber-950/40 border border-amber-500/25 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-400">
              Tienes acceso de solo lectura a las tareas.
            </p>
          </div>
        )}

        {/* Buscador */}
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-5 mb-2" data-tour="task-search">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-600">Buscar Tarea</h2>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="search-tasks" className="sr-only">Buscar tareas</label>
              <input
                id="search-tasks"
                type="text"
                placeholder="Escribe el nombre de la tarea..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition-colors"
              data-tour="task-filter-button"
            >
              {showFilters ? '▲ Ocultar filtros' : '▼ Mostrar filtros'}
            </button>
          </div>
        </div>

        {/* Botón Actualizar */}
        <div className="flex justify-end mb-6">
          <button
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Actualizar tareas"
            data-testid="refresh-tasks"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {/* Filtros - Expandibles */}
        {showFilters && (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-5 mb-6" data-tour="task-filters">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-600 mb-4">Filtros</h2>
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label htmlFor="filter-year" className="block text-sm font-medium mb-1">Año</label>
              <select
                id="filter-year"
                value={filters.year}
                onChange={(e) =>
                  updateFilters({ year: parseInt(e.target.value) })
                }
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Array.from({ length: 5 }, (_, i) => 2026 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-month" className="block text-sm font-medium mb-1">Mes</label>
              <select
                id="filter-month"
                value={filters.month}
                onChange={(e) =>
                  updateFilters({ month: parseInt(e.target.value) })
                }
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-product" className="block text-sm font-medium mb-1">Producto</label>
              <select
                id="filter-product"
                value={filters.productType}
                onChange={(e) =>
                  updateFilters({ productType: e.target.value, squad: '' })
                }
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">Seleccionar producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-squad" className="block text-sm font-medium mb-1">Squad</label>
              <select
                id="filter-squad"
                value={filters.squad}
                onChange={(e) =>
                  updateFilters({ squad: e.target.value })
                }
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!filters.productType}
              >
                <option value="">Todos</option>
                {availableSquads.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-status" className="block text-sm font-medium mb-1">Estado</label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) =>
                  updateFilters({ status: e.target.value })
                }
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="Completada">Completada</option>
                <option value="Deprecada">Deprecada</option>
                <option value="Pendiente">Pendiente</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => updateFilters({
              month: new Date().getMonth() + 1,
              year: new Date().getFullYear(),
              productType: '',
              squad: '',
              status: '',
            })}
            className="mt-4 px-3 py-1.5 border border-red-500/40 hover:border-red-500/70 hover:bg-red-950/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
        )}

        {/* Tabla de tareas */}
        {loading ? (
          <SkeletonTable />
        ) : tasks.filter((task) => task.name.toLowerCase().includes(searchTerm)).length === 0 ? (
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-6 text-center fade-in-smooth" data-testid="tasks-empty-state">
            <p className="text-gray-600 py-8">
              {hasError
                ? 'Ocurrió un error al consultar los registros. Intenta actualizar la página.'
                : tasks.length === 0 
                ? 'No hay tareas' 
                : `No se encontraron tareas que coincidan con "${searchTerm}"`
              }
            </p>
            {hasError && (
              <button
                onClick={() => window.location.reload()}
                className="mt-4 text-blue-600 hover:text-blue-800 underline"
              >
                Reintentar
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-100 border border-gray-200 rounded-xl overflow-x-auto fade-in-smooth" data-testid="tasks-table-container">
            <table className="w-full" data-tour="task-table" data-testid="tasks-table">
              <thead className="bg-gray-200 border-b border-gray-300">
                <tr>
                  <th className="w-12"></th>
                  <th className="px-4 py-3 text-left text-sm font-semibold w-12">N°</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold min-w-max">Nombre</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Producto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Complejidad</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Categoría</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Estado</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Equipos</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Nota Prom.</th>
                  {canManageTasks && (
                    <th className="px-4 py-3 text-left text-sm font-semibold">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {tasks
                  .filter((task) => task.name.toLowerCase().includes(searchTerm))
                  .map((task, index) => {
                    const squads = task.squads || [];
                    const avgScore = squads.length > 0 
                      ? formatScore(squads.reduce((sum: number, sq) => sum + (sq.calculated_score || 0), 0) / squads.length)
                      : '0.0';
                    const isExpanded = expandedTaskId === task.id;

                    return (
                      <React.Fragment key={task.id}>
                        <tr 
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          className="border-b border-gray-200 hover:bg-gray-200 cursor-pointer transition-colors"
                          data-tour="task-table-row"
                        >
                          <td className="px-2 py-3 text-center">
                            <button
                              className="text-gray-600 hover:text-gray-800 p-1"
                              data-tour="task-row-expand-btn"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">{index + 1}</td>
                          <td className="px-4 py-3 text-sm max-w-xs">
                            <div className="truncate" title={task.name}>
                              {task.task_link ? (
                                <a
                                  href={task.task_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline hover:text-blue-800"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {task.name}
                                </a>
                              ) : (
                                task.name
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="text-gray-800">{task.product_type}</span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="inline-flex items-center rounded-full badge-violet px-2 py-0.5 text-xs font-semibold">
                              {task.tshirt_size || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="inline-flex items-center rounded-full badge-purple px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                              {task.category || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                              task.status === 'Completada' ? 'badge-success' :
                              task.status === 'Deprecada' ? 'badge-neutral' :
                              'badge-warning'
                            }`}>
                              {task.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {squads.length === 1 ? (
                              <span className="text-gray-800">{squads[0].squad}</span>
                            ) : (
                              <span className="bg-blue-50 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                                {squads.length} {squads.length === 2 ? 'equipo' : 'equipos'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {task.status === 'Pendiente' || task.status === 'Deprecada' ? '-' : `${avgScore}/10`}
                          </td>
                          {canManageTasks && (
                            <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()} data-tour="task-actions">
                              <div className="flex gap-2">
                                <div className="group relative">
                                  <button
                                    onClick={() => {
                                      setEditingTask(task);
                                      setShowForm(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 transition-colors p-1"
                                    title="Editar tarea"
                                    data-testid={`edit-task-${task.id}`}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    Editar tarea
                                  </div>
                                </div>
                                <div className="group relative">
                                  <button
                                    onClick={() => handleDelete(task.id)}
                                    className="text-red-600 hover:text-red-800 transition-colors p-1"
                                    title="Eliminar tarea"
                                    data-testid={`delete-task-${task.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    Eliminar tarea
                                  </div>
                                </div>
                              </div>
                            </td>
                          )}
                        </tr>
                        {/* Fila expandida con detalles */}
                        {isExpanded && squads.length > 0 && (
                          <tr className="border-b border-gray-200 bg-gray-200" data-tour="task-row-details">
                            <td colSpan={canManageTasks ? 11 : 10} className="px-6 py-4">
                              <div className="space-y-4">
                                {/* Info adicional de la tarea */}
                                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                                  {task.effort_score_date && (
                                    <span className="inline-flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/25 rounded px-2 py-1">
                                      <span className="font-semibold text-emerald-400">Fecha Esfuerzo:</span>
                                      <span className="text-emerald-300 num">{task.effort_score_date}</span>
                                    </span>
                                  )}
                                  {task.assigned_qa && task.assigned_qa.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded px-2 py-1">
                                      <Users className="w-3.5 h-3.5 text-blue-600" />
                                      <span className="font-semibold text-blue-700">QA Asignados:</span>
                                      <span className="text-blue-700">{task.assigned_qa.join(', ')}</span>
                                    </span>
                                  )}
                                </div>
                                {/* Tabla de squads */}
                                <div className="bg-gray-100 border border-gray-300 rounded-lg overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-300 border-b border-gray-400">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Equipo</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Bajas</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Medias</th>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-700">Graves</th>
                                        <th className="px-3 py-2 text-right font-semibold text-gray-700">Nota</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {squads.map((squad, squadIndex: number) => (
                                        <React.Fragment key={squadIndex}>
                                          <tr className="border-b hover:bg-gray-50">
                                            <td className="px-3 py-2 font-medium text-gray-800">{squad.squad}</td>
                                            <td className="px-3 py-2 text-gray-700">{squad.low_returns}</td>
                                            <td className="px-3 py-2 text-gray-700">{squad.medium_returns}</td>
                                            <td className="px-3 py-2 text-gray-700">{squad.high_returns}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                              {typeof squad.calculated_score === 'number' 
                                                ? formatScore(squad.calculated_score)
                                                : squad.calculated_score || '0.0'
                                              }/10
                                            </td>
                                          </tr>
                                          {squad.additional_notes && (
                                            <tr className="border-b border-gray-200 bg-blue-100">
                                              <td colSpan={5} className="px-3 py-2">
                                                <p className="text-xs font-semibold text-blue-700 mb-1">Notas:</p>
                                                <p className="text-sm text-blue-700">{squad.additional_notes}</p>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <Modal
            isOpen={showForm}
            title={editingTask ? 'Editar Tarea' : 'Nueva Tarea'}
            onClose={() => {
              setShowForm(false);
              setEditingTask(null);
            }}
            onHeaderClose={handleFormHeaderClose}
          >
            <TaskForm
              ref={formRef}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingTask(null);
              }}
              initialData={editingTask as Record<string, unknown> | null}
              isLoading={submitting}
            />
          </Modal>
        )}
      </main>
    </>
  );
}
