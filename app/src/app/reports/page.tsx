'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSafeAuthFetch } from '@/hooks/useSafeAuthFetch';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import Navbar from '@/components/Navbar';
import CacheWarningBanner from '@/components/CacheWarningBanner';
import { Button } from '@/components/ui/button';
import { SkeletonReports } from '@/components/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, Trash2, Download, RefreshCw } from 'lucide-react';
import { downloadReportPDF } from '@/lib/services/pdfService';
import Modal from '@/components/Modal';
import ReportDetailModal from '@/components/ReportDetailModal';
import { Report } from '@/lib/types';
import { useCatalogData } from '@/hooks/useCatalogData';

export default function ReportsPage() {
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showListFilters, setShowListFilters] = useState(true);
  
  // Calcular mes anterior para filtros por defecto
  const getPreviousMonth = useCallback(() => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    if (currentMonth === 1) {
      return { month: 12, year: currentYear - 1 };
    }
    return { month: currentMonth - 1, year: currentYear };
  }, []);

  const prevMonth = getPreviousMonth();
  
  const [filters, setFilters] = useState({
    month: prevMonth.month,
    year: prevMonth.year,
    productType: '',
    squad: '',
  });
  const [listFilters, setListFilters] = useState({
    month: prevMonth.month,
    year: prevMonth.year,
    productType: '',
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const { safeFetch } = useSafeAuthFetch();
  const { products, squads: allSquads } = useCatalogData();

  // Redirigir a login si no hay sesión
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  // Leer filtros desde URL params al cargar el cliente
  useEffect(() => {
    setIsClient(true);
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : prevMonth.month;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : prevMonth.year;
    const productType = searchParams.get('productType') || '';
    const squad = searchParams.get('squad') || '';

    setFilters({
      month,
      year,
      productType,
      squad,
    });
  }, [searchParams, prevMonth.month, prevMonth.year]);

  // Fetch de reportes con caché
  const fetchReports = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams();
      if (listFilters.month) params.append('month', listFilters.month.toString());
      if (listFilters.year) params.append('year', listFilters.year.toString());
      if (listFilters.productType) params.append('squad', listFilters.productType);

      const response = await safeFetch(`/api/reports?${params.toString()}`, { signal });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return [];
        }
        throw new Error(`Error al cargar reportes: ${response.status}`);
      }

      const data = await response.json();
      return data.sort((a: Report, b: Report) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
    },
    [safeFetch, listFilters, router],
  );

  const {
    data: reports,
    loading,
    error: fetchError,
    isRefreshing,
    refresh: handleRefresh,
    invalidate: invalidateReports,
    setData: setReports,
  } = useCachedFetch<Report[]>({
    cacheKey: 'reports',
    fetchFn: fetchReports,
    filters: listFilters,
    enabled: !authLoading,
    initialData: [],
  });

  const hasError = !!fetchError;

  const canGenerateReports = profile?.role === 'admin' || profile?.role === 'gestor';

  // Función para actualizar filtros y URL
  const updateFilters = (newFilters: Partial<typeof filters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);

    // Actualizar URL params
    if (isClient) {
      const params = new URLSearchParams();
      if (updatedFilters.month) params.set('month', updatedFilters.month.toString());
      if (updatedFilters.year) params.set('year', updatedFilters.year.toString());
      if (updatedFilters.productType) params.set('productType', updatedFilters.productType);
      if (updatedFilters.squad) params.set('squad', updatedFilters.squad);
      
      router.push(`/reports?${params.toString()}`, { scroll: false });
    }
  };

  const generateAICommentsBatch = async (comments: { tasks: Record<string, unknown>[]; type: string; squadName: string }[]) => {
    try {
      console.warn('Enviando comentarios a IA:', comments);
      
      const response = await safeFetch('/api/generate-ai-comments-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response from API:', errorData);
        throw new Error(errorData.error || 'Error al generar comentarios');
      }
      
      const result = await response.json();
      console.warn('Comentarios generados exitosamente:', result);
      return result;
    } catch (error: unknown) {
      console.error('Error en generateAICommentsBatch:', error);
      throw error;
    }
  };

  const generateReport = async () => {
    try {
      setGeneratingReport(true);
      setGenerationProgress(0);

      const tasksResponse = await safeFetch(
        `/api/tasks?month=${filters.month}&year=${filters.year}`
      );
      if (!tasksResponse.ok) throw new Error('Error al obtener tareas');
      const allTasks = await tasksResponse.json();
      
      console.warn('All tasks fetched:', allTasks);
      console.warn('Filtering for productType:', filters.productType, 'status:', 'Completada');

      const productObj = products.find((p) => p.name === filters.productType);
      const squadsForProduct = productObj
        ? allSquads.filter((s) => s.product_id === productObj.id).map((s) => s.name)
        : [];
      let currentStep = 1;
      const totalSteps = squadsForProduct.length * 2 + 2;

      const tasksBySquad: Record<string, Record<string, unknown>[]> = {};
      const deprecatedPendingBySquad: Record<string, Record<string, unknown>[]> = {};
      const squadsScores: Record<string, number> = {};

      for (const squad of squadsForProduct) {
        // Filtrar tareas completadas que tengan este squad en task_squad
        const squadTasks = allTasks.filter((t: Record<string, unknown>) => {
          if (t.status !== 'Completada') return false;
          // Buscar si este squad está en los squads de la tarea
          return Array.isArray(t.squads) && t.squads.some((sq: Record<string, unknown>) => sq.squad === squad);
        });
        
        console.warn(`Tasks for ${squad}:`, squadTasks);
        
        // Para cada tarea, obtener los datos específicos de este squad
        tasksBySquad[squad] = squadTasks.map((task: Record<string, unknown>) => {
          // Encontrar el squad data específico para este squad
          const squadsArr = Array.isArray(task.squads) ? task.squads : [];
          const squadData = squadsArr.find((sq: Record<string, unknown>) => sq.squad === squad) as Record<string, unknown> | undefined;
          
          if (!squadData) {
            return null; // No debería pasar ya que filtramos arriba
          }

          // Usar la nota calculada que está en task_squad
          const score = (squadData?.calculated_score as number) || 10;

          return {
            ...task,
            squad: squad,
            low_returns: (squadData?.low_returns as number) || 0,
            medium_returns: (squadData?.medium_returns as number) || 0,
            high_returns: (squadData?.high_returns as number) || 0,
            calculated_score: score,
            additional_notes: (squadData?.additional_notes as string) || '', // Usar notas del squad específico
          };
        }).filter((t: Record<string, unknown> | null): t is Record<string, unknown> => t !== null);

        // Obtener tareas deprecadas/pendientes que tengan este squad
        const deprecatedOrPending = allTasks.filter((t: Record<string, unknown>) => {
          if (t.status === 'Completada') return false;
          return Array.isArray(t.squads) && t.squads.some((sq: Record<string, unknown>) => sq.squad === squad);
        });
        deprecatedPendingBySquad[squad] = deprecatedOrPending;

        // Calcular nota final del squad
        if (tasksBySquad[squad].length > 0) {
          const totalScore = tasksBySquad[squad].reduce((sum: number, task: Record<string, unknown>) => sum + (task.calculated_score as number), 0);
          squadsScores[squad] = totalScore / tasksBySquad[squad].length;
        } else {
          squadsScores[squad] = 0;
        }

        currentStep++;
        setGenerationProgress(Math.round((currentStep / totalSteps) * 100));
      }

      console.warn('tasksBySquad to save:', tasksBySquad);
      console.warn('deprecatedPendingBySquad to save:', deprecatedPendingBySquad);

      const commentsToGenerate = [];
      for (const squad of squadsForProduct) {
        if (tasksBySquad[squad].length > 0) {
          commentsToGenerate.push(
            { squadName: squad, tasks: tasksBySquad[squad], type: 'performance' as const },
            { squadName: squad, tasks: tasksBySquad[squad], type: 'communication' as const }
          );
        }
      }

      setGenerationProgress(Math.round((currentStep / totalSteps) * 100));
      
      // Los comentarios de IA son opcionales - solo generar si hay tareas completadas
      const performanceComments: Record<string, string> = {};
      const communicationComments: Record<string, string> = {};
      
      if (commentsToGenerate.length > 0) {
        try {
          const allComments = await generateAICommentsBatch(commentsToGenerate);
          
          for (const squad of squadsForProduct) {
            const perfKey = `${squad}-performance`;
            const commKey = `${squad}-communication`;
            if (allComments.comments && allComments.comments[perfKey]) {
              performanceComments[squad] = allComments.comments[perfKey];
            }
            if (allComments.comments && allComments.comments[commKey]) {
              communicationComments[squad] = allComments.comments[commKey];
            }
          }
        } catch (aiError: unknown) {
          console.warn('Advertencia: No se pudieron generar comentarios IA, continuando sin ellos:', aiError);
          // Continuar sin comentarios IA
        }
      } else {
        console.warn('No hay tareas completadas, generando reporte sin comentarios IA');
      }

      currentStep++;
      setGenerationProgress(Math.round((currentStep / totalSteps) * 100));

      const reportResponse = await safeFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squad: filters.productType,
          month: filters.month,
          year: filters.year,
          performance_comment: JSON.stringify(performanceComments),
          communication_comment: JSON.stringify(communicationComments),
          report_data: {
            productType: filters.productType,
            squads: squadsForProduct,
            tasksBySquad: tasksBySquad,
            deprecatedPendingBySquad: deprecatedPendingBySquad,
            squadsScores: squadsScores,
          },
        }),
      });

      if (!reportResponse.ok) throw new Error('Error al crear reporte');

      invalidateReports();
      setGeneratingReport(false);
      setGenerationProgress(0);
    } catch (error: unknown) {
      console.error('Error en generateReport:', error);
      setGeneratingReport(false);
      setGenerationProgress(0);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido al generar reporte';
      alert(`Error: ${errorMessage}`);
    }
  };

  const deleteReport = async (reportId: string) => {
    try {
      // Optimistic update
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setDeleteConfirm(null);

      const response = await safeFetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        // Rollback on error
        invalidateReports();
        throw new Error('Error al eliminar reporte');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleDownloadPDF = async (report: Report) => {
    try {
      setDownloadingReportId(report.id);
      
      downloadReportPDF(
        report.report_data,
        report.month,
        report.year,
        '',
        `Reporte-Evaluaciones-${report.month}-${report.year}-v${report.version}.pdf`
      );
    } catch (error) {
      console.error('Error descargando PDF:', error);
      alert('Error al descargar el reporte');
    } finally {
      setDownloadingReportId(null);
    }
  };

  // const availableSquads = filters.productType ? squadsByType[filters.productType] : squads;

  // const sortSquadsByNumber = (squads: string[]) => {
  //   return [...squads].sort((a, b) => {
  //     const numA = parseInt(a.match(/\d+/)?.[0] || '0');
  //     const numB = parseInt(b.match(/\d+/)?.[0] || '0');
  //     return numA - numB;
  //   });
  // };

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CacheWarningBanner />
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Reportes</h1>
        </div>

        {canGenerateReports && (
          <div className="bg-white rounded-lg shadow p-6 mb-8" data-tour="report-filters">
            <h2 className="text-xl font-semibold mb-4">Generar Reporte</h2>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div>
                <label htmlFor="reports-year" className="block text-sm font-medium mb-1">Año</label>
                <select
                  id="reports-year"
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
                <label htmlFor="reports-month" className="block text-sm font-medium mb-1">Mes</label>
                <select
                  id="reports-month"
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
                <label htmlFor="reports-product" className="block text-sm font-medium mb-1">Producto</label>
                <select
                  id="reports-product"
                  value={filters.productType}
                  onChange={(e) =>
                    updateFilters({ productType: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={generateReport}
                  disabled={!filters.productType || generatingReport}
                  className="w-full"
                  data-tour="report-generate-btn"
                >
                  {generatingReport ? `Generando... ${generationProgress}%` : 'Generar Reporte'}
                </Button>
              </div>
            </div>
            
            {generatingReport && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">Generando reporte... {generationProgress}%</p>
              </div>
            )}
          </div>
        )}

        {/* Filtros de reportes generados */}
        <div className="bg-white rounded-lg shadow p-6 mb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Reportes Generados</h2>
            <button
              onClick={() => setShowListFilters(!showListFilters)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition-colors"
            >
              {showListFilters ? '▲ Ocultar Filtros' : '▼ Mostrar Filtros'}
            </button>
          </div>
          {showListFilters && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <label htmlFor="list-filter-year" className="block text-sm font-medium mb-1">Año</label>
                <select
                  id="list-filter-year"
                  value={listFilters.year}
                  onChange={(e) =>
                    setListFilters((prev) => ({ ...prev, year: parseInt(e.target.value) }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => 2026 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="list-filter-month" className="block text-sm font-medium mb-1">Mes</label>
                <select
                  id="list-filter-month"
                  value={listFilters.month}
                  onChange={(e) =>
                    setListFilters((prev) => ({ ...prev, month: parseInt(e.target.value) }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value={0}>Todos</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="list-filter-product" className="block text-sm font-medium mb-1">Producto</label>
                <select
                  id="list-filter-product"
                  value={listFilters.productType}
                  onChange={(e) =>
                    setListFilters((prev) => ({ ...prev, productType: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Todos</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Botón de actualizar */}
        <div className="flex justify-end mb-8">
          <button
            onClick={handleRefresh}
            disabled={loading || isRefreshing || generatingReport}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Actualizar reportes"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {!authLoading && !canGenerateReports && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              Tienes acceso de solo lectura a los reportes.
            </p>
          </div>
        )}

        {loading ? (
          <SkeletonReports />
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            <p>
              {hasError
                ? 'Ocurrió un error al consultar los registros. Por favor, intenta nuevamente.'
                : 'No hay reportes para los filtros seleccionados'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-blue-600 hover:text-blue-800 underline"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 fade-in-smooth" data-tour="report-list">
            {reports.map((report) => (
              <div key={report.id} className="bg-white rounded-lg shadow p-6 aspect-square flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    Producto: {report.squad}
                  </h3>
                  <p className="text-gray-600 text-sm mb-1" data-tour="report-versioning">
                    {report.month}/{report.year} - Versión {report.version}
                  </p>
                  <p className="text-sm text-gray-600">
                    Generado: {new Date(report.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <div className="group relative" data-tour="report-view">
                    <button
                      onClick={() => {
                        setSelectedReportId(report.id);
                        setIsDetailModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors p-2"
                      title="Ver reporte"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Ver reporte
                    </div>
                  </div>
                  <div className="group relative" data-tour="report-download">
                    <button
                      onClick={() => handleDownloadPDF(report)}
                      disabled={downloadingReportId === report.id}
                      className="text-green-600 hover:text-green-800 transition-colors p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Descargar reporte en PDF"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Descargar PDF
                    </div>
                  </div>
                  <div className="group relative" data-tour="report-delete">
                    <button
                      onClick={() => setDeleteConfirm(report.id)}
                      className="text-red-600 hover:text-red-800 transition-colors p-2"
                      title="Eliminar reporte"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Eliminar reporte
                    </div>
                  </div>
                </div>

                {deleteConfirm === report.id && (
                  <Modal
                    isOpen={true}
                    title="Confirmar eliminación"
                    onClose={() => setDeleteConfirm(null)}
                    size="sm"
                  >
                    <div className="space-y-6">
                      <p className="text-gray-600">
                        ¿Estás seguro de que deseas eliminar este reporte? Esta acción no se puede deshacer.
                      </p>
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1"
                        >
                          Cancelar
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => deleteReport(report.id)}
                          className="flex-1"
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </Modal>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <ReportDetailModal
        isOpen={isDetailModalOpen}
        reportId={selectedReportId || ''}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedReportId(null);
        }}
      />
    </>
  );
}
