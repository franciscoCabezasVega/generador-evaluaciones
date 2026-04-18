'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, WifiOff } from 'lucide-react';
import { useMutationQueue } from '@/contexts/MutationQueueContext';

/**
 * Indicador compacto del estado de la cola de mutaciones.
 *
 * - No muestra nada cuando la cola está vacía y hay conexión.
 * - Muestra un spinner mientras sincroniza cambios en background.
 * - Muestra una advertencia con botón "Reintentar" si hay fallos.
 * - Muestra un aviso de sin conexión cuando navigator.onLine === false.
 *
 * Diseñado para colocarse en la Navbar junto al área de usuario.
 */
export default function QueueStatusIndicator() {
  const { queueStatus, retryFailed } = useMutationQueue();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-600"
        title="Sin conexión a Internet. Los cambios se guardarán cuando vuelvas a conectarte."
      >
        <WifiOff size={12} />
        <span className="hidden sm:inline">Sin conexión</span>
      </div>
    );
  }

  if (queueStatus.failed > 0) {
    return (
      <button
        onClick={retryFailed}
        className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-500/20"
        title={`${queueStatus.failed} cambio${queueStatus.failed !== 1 ? 's' : ''} no se pudo${queueStatus.failed !== 1 ? 'eron' : ''} sincronizar. Haz clic para reintentar.`}
      >
        <AlertTriangle size={12} />
        <span className="hidden sm:inline">
          {queueStatus.failed} sin sincronizar
        </span>
      </button>
    );
  }

  if (queueStatus.pending > 0 || queueStatus.processing) {
    const count = queueStatus.pending;
    return (
      <div
        className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-xs text-blue-600"
        title="Sincronizando cambios en segundo plano..."
      >
        <Loader2 size={12} className="animate-spin" />
        <span className="hidden sm:inline">
          {count > 1 ? `Sincronizando ${count}...` : 'Sincronizando...'}
        </span>
      </div>
    );
  }

  return null;
}
