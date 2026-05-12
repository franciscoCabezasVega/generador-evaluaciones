"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  MutationQueue,
  MutationItem,
  EnqueueParams,
} from "@/lib/mutationQueue";
import { invalidateCache } from "@/hooks/useCachedFetch";

// ─── Tipos del contexto ───────────────────────────────────────────────────────

export interface QueueStatus {
  /** Ítems pendientes de enviar (incluye los que están en proceso) */
  pending: number;
  /** Si hay activamente una request en vuelo */
  processing: boolean;
  /** Ítems que fallaron (incluyendo fallos permanentes) */
  failed: number;
  /** Ítems que están siendo reintentados (attempt > 1) */
  retryingCount: number;
}

interface MutationQueueContextValue {
  /** Encola una mutación y ejecuta el optimisticUpdate de inmediato */
  enqueue: (params: EnqueueParams) => string;
  /** Estado resumido de la cola para mostrar en la UI */
  queueStatus: QueueStatus;
  /** Reintenta todos los ítems fallidos manualmente */
  retryFailed: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const MutationQueueContext = createContext<MutationQueueContextValue | null>(
  null,
);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MutationQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queueRef = useRef<MutationQueue | null>(null);

  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    pending: 0,
    processing: false,
    failed: 0,
    retryingCount: 0,
  });

  useEffect(() => {
    const queue = new MutationQueue();
    queueRef.current = queue;

    const syncStatus = () => {
      const s = queue.getStatus();
      setQueueStatus({
        pending: s.pending,
        processing: s.processing,
        failed: s.failed,
        retryingCount: s.retryingCount,
      });
    };

    queue.configure({
      onStatusChange: syncStatus,

      onSuccess: (item: MutationItem) => {
        // Invalidar cachés relevantes para que la UI refleje los datos reales
        if (item.cacheKeys) {
          item.cacheKeys.forEach((key) => invalidateCache(key));
        }
      },

      onPermanentFailure: (item: MutationItem) => {
        console.error(
          "[MutationQueue] Fallo permanente:",
          item.method,
          item.url,
          "—",
          item.error,
        );
      },
    });

    // Sincronizar estado inicial (puede haber ítems restaurados de localStorage)
    syncStatus();

    // Si hay ítems pendientes restaurados, procesarlos
    const initialStatus = queue.getStatus();
    if (initialStatus.pending > 0) {
      void queue.processQueue();
    }

    return () => {
      queue.destroy();
      queueRef.current = null;
    };
  }, []);

  const enqueue = useCallback((params: EnqueueParams): string => {
    if (!queueRef.current) {
      throw new Error("[MutationQueue] Cola no inicializada");
    }
    return queueRef.current.enqueue(params);
  }, []);

  const retryFailed = useCallback(() => {
    queueRef.current?.retryFailed();
  }, []);

  return (
    <MutationQueueContext.Provider
      value={{ enqueue, queueStatus, retryFailed }}
    >
      {children}
    </MutationQueueContext.Provider>
  );
}

// ─── Hook de acceso ───────────────────────────────────────────────────────────

/**
 * Accede a la cola de mutaciones desde cualquier componente dentro de
 * MutationQueueProvider.
 */
export function useMutationQueue(): MutationQueueContextValue {
  const ctx = useContext(MutationQueueContext);
  if (!ctx) {
    throw new Error(
      "useMutationQueue debe usarse dentro de <MutationQueueProvider>",
    );
  }
  return ctx;
}
