// Archivo de Ejemplo: Cómo integrar historial de auditoría en detalles de tarea/reporte
// Este archivo muestra cómo usar el componente AuditHistory en tus páginas

import { useEffect, useState } from 'react';
import { useSafeAuthFetch } from '@/hooks/useSafeAuthFetch';
import { AuditLog } from '@/lib/types';
import AuditHistory from '@/components/AuditHistory';

/**
 * Ejemplo 1: En la página de detalle de una tarea
 */
export function TaskDetailWithAuditHistory({ taskId }: { taskId: string }) {
  const { safeFetch } = useSafeAuthFetch();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadAuditHistory = async () => {
      try {
        setIsLoading(true);
        const response = await safeFetch(
          `/api/audit-logs/task/${taskId}`,
          { method: 'GET' }
        );

        if (response.ok) {
          const data = await response.json();
          setAuditLogs(data.data);
        }
      } catch (error) {
        console.error('Error loading audit history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuditHistory();
  }, [taskId, safeFetch]);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Historial de Cambios</h2>
        <AuditHistory logs={auditLogs} isLoading={isLoading} />
      </div>
    </div>
  );
}

/**
 * Ejemplo 2: En la página de detalle de un reporte
 */
export function ReportDetailWithAuditHistory({ reportId }: { reportId: string }) {
  const { safeFetch } = useSafeAuthFetch();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadAuditHistory = async () => {
      try {
        setIsLoading(true);
        const response = await safeFetch(
          `/api/audit-logs/report/${reportId}`,
          { method: 'GET' }
        );

        if (response.ok) {
          const data = await response.json();
          setAuditLogs(data.data);
        }
      } catch (error) {
        console.error('Error loading audit history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuditHistory();
  }, [reportId, safeFetch]);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Historial de Versiones</h2>
        <AuditHistory logs={auditLogs} isLoading={isLoading} />
      </div>
    </div>
  );
}

/**
 * Ejemplo 3: Hook personalizado para reutilizar la lógica
 */
export function useEntityAuditHistory(entityType: 'task' | 'report', entityId: string) {
  const { safeFetch } = useSafeAuthFetch();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await safeFetch(
          `/api/audit-logs/${entityType}/${entityId}`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error('Failed to load audit history');
        }

        const data = await response.json();
        setLogs(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [entityType, entityId, safeFetch]);

  return { logs, isLoading, error };
}

/**
 * Ejemplo 4: Integración en un Modal
 */
import Modal from '@/components/Modal';

export function AuditHistoryModal({
  isOpen,
  onClose,
  entityType,
  entityId,
}: {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'task' | 'report';
  entityId: string;
}) {
  const { logs, isLoading, error } = useEntityAuditHistory(entityType, entityId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Historial de Cambios">
      {error ? (
        <div className="text-red-600 p-4">Error: {error}</div>
      ) : (
        <AuditHistory logs={logs} isLoading={isLoading} />
      )}
    </Modal>
  );
}

/**
 * Ejemplo 5: Integración en una tabla (mostrar último cambio)
 */
export function TaskRowWithLastChange({ task }: { task: { id: string; name: string; status: string } }) {
  const { logs } = useEntityAuditHistory('task', task.id);
  const lastChange = logs[0];

  return (
    <tr>
      <td>{task.name}</td>
      <td>{task.status}</td>
      <td>
        {lastChange ? (
          <div className="text-sm">
            <div>{lastChange.action}</div>
            <div className="text-gray-500">
              por {lastChange.user_email}
            </div>
          </div>
        ) : (
          'Sin cambios'
        )}
      </td>
    </tr>
  );
}

/**
 * Ejemplo 6: Usando el hook en un componente simple
 */
export function TaskAuditTimeline({ taskId }: { taskId: string }) {
  const { logs, isLoading } = useEntityAuditHistory('task', taskId);

  if (isLoading) return <div>Cargando...</div>;

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-4 pb-4 border-b last:border-b-0">
          <div className="flex-1">
            <div className="font-semibold">
              {log.action} - {new Date(log.timestamp).toLocaleDateString()}
            </div>
            <div className="text-sm text-gray-600">{log.user_email}</div>
          </div>
          <div className="text-right">
            <div className={`px-2 py-1 rounded text-xs font-semibold ${
              log.action === 'CREATE'
                ? 'bg-green-100 text-green-800'
                : log.action === 'UPDATE'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {log.action}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
