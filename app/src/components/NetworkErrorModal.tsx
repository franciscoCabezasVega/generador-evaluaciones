'use client';

import React, { useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import { Button } from '@/components/ui/button';

interface NetworkErrorModalProps {
  isOpen: boolean;
  message: string;
  errorDetails?: string;
  attemptCount?: number;
  maxRetries?: number;
  onRetry?: () => Promise<void> | void;
  onRefresh?: () => void;
  onDismiss?: () => void;
  showRetryButton?: boolean;
  showRefreshButton?: boolean;
  isDanger?: boolean; // Mostrar en rojo para errores críticos
  retrying?: boolean;
}

/**
 * Modal para mostrar errores de conexión de forma amigable
 * Proporciona opciones para reintentar, refrescar la página o descartar
 */
export default function NetworkErrorModal({
  isOpen,
  message,
  errorDetails,
  attemptCount = 0,
  maxRetries = 3,
  onRetry,
  onRefresh,
  onDismiss,
  showRetryButton = true,
  showRefreshButton = true,
  isDanger = false,
  retrying = false,
}: NetworkErrorModalProps) {
  const handleRetry = useCallback(async () => {
    if (onRetry) {
      try {
        await onRetry();
      } catch (error) {
        console.error('Error during retry:', error);
      }
    }
  }, [onRetry]);

  const handleRefresh = useCallback(() => {
    if (onRefresh) {
      onRefresh();
    } else {
      window.location.reload();
    }
  }, [onRefresh]);

  if (!isOpen) return null;

  const shouldShowRetryButton = showRetryButton && attemptCount < maxRetries;
  const title = isDanger ? 'Error de Conexión' : 'Problema de Conexión';

  return (
    <Modal 
      isOpen={isOpen} 
      title={title}
      onClose={onDismiss || (() => {})}
      size="md"
    >
      <div className="space-y-4">
        {/* Icon and message */}
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={`w-6 h-6 flex-shrink-0 mt-0.5 ${isDanger ? 'text-red-600' : 'text-yellow-600'}`}
          />
          <p className={`text-sm mb-2 ${isDanger ? 'text-red-700' : 'text-gray-700'}`}>
            {message}
          </p>
        </div>

        {/* Attempt counter */}
        {attemptCount > 0 && (
          <p className="text-xs text-gray-500">
            Intentos fallidos: {attemptCount} de {maxRetries}
          </p>
        )}

        {/* Error details (development) */}
        {errorDetails && process.env.NODE_ENV === 'development' && (
          <details className="mt-3">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Detalles del error
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32 text-gray-600">
              {errorDetails}
            </pre>
          </details>
        )}

        {/* Auto-close countdown */}
        {attemptCount >= maxRetries && (
          <p className="text-xs text-gray-500 text-center">
            Se han agotado los reintentos. Por favor, recarga la página o intenta más tarde.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
        {shouldShowRetryButton && (
          <Button
            onClick={handleRetry}
            disabled={retrying}
            variant="default"
            className="flex-1 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Reintentando...' : 'Reintentar'}
          </Button>
        )}

        {showRefreshButton && (
          <Button
            onClick={handleRefresh}
            variant="outline"
            className="flex-1"
          >
            Recargar Página
          </Button>
        )}

        {!shouldShowRetryButton && !showRefreshButton && onDismiss && (
          <Button onClick={onDismiss} variant="outline" className="flex-1">
            Descartar
          </Button>
        )}
      </div>
    </Modal>
  );
}
