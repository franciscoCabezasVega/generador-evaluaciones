'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { withRetry, RetryError, type RetryConfig } from '@/lib/withRetry';
import { TimeoutError } from '@/lib/withTimeout';

export interface FetchWithRetryOptions extends RetryConfig {
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  onRetryAttempt?: (attempt: number, error: Error) => void;
}

export interface UseFetchWithRetryReturn {
  execute: (
    url: string,
    options?: RequestInit
  ) => Promise<Response | null>;
  isLoading: boolean;
  error: Error | null;
  attemptCount: number;
  clearError: () => void;
}

/**
 * Hook para ejecutar fetches con reintentos automáticos y timeout
 * Maneja:
 * - Reintentos automáticos con backoff exponencial
 * - Timeout configurable
 * - Detección de errores de red vs timeout
 * - Callbacks para UI feedback
 * 
 * @param options - Opciones de reintentos y callbacks
 */
export function useFetchWithRetry(
  options: FetchWithRetryOptions = {}
): UseFetchWithRetryReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const isMountedRef = useRef(true);
  const abortControllersRef = useRef<Set<AbortController>>(new Set());

  const {
    maxRetries = 3,
    timeoutMs = 10000,
    backoffMultiplier = 2,
    initialBackoffMs = 1000,
    onError,
    onSuccess,
    onRetryAttempt,
  } = options;

  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      // Abortar todas las requests pendientes al desmontar
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
  }, []);

  const execute = useCallback(
    async (
      url: string,
      fetchOptions: RequestInit = {}
    ): Promise<Response | null> => {
      if (!isMountedRef.current) return null;

      setIsLoading(true);
      setError(null);
      setAttemptCount(0);

      const abortController = new AbortController();
      abortControllersRef.current.add(abortController);

      try {
        const response = await withRetry(
          () =>
            fetch(url, {
              ...fetchOptions,
              signal: abortController.signal,
            }),
          {
            maxRetries,
            timeoutMs,
            backoffMultiplier,
            initialBackoffMs,
            onRetry: (attempt, err) => {
              if (isMountedRef.current) {
                setAttemptCount(attempt);
                onRetryAttempt?.(attempt, err);
              }
            },
          }
        );

        abortControllersRef.current.delete(abortController);

        if (isMountedRef.current) {
          setIsLoading(false);
          onSuccess?.();
        }

        return response;
      } catch (err) {
        // Ignorar AbortError (componente se desmontó)
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.warn('Fetch aborted - component unmounted');
          abortControllersRef.current.delete(abortController);
          return null;
        }

        const error = err instanceof Error ? err : new Error(String(err));

        if (isMountedRef.current) {
          setError(error);
          setIsLoading(false);
          onError?.(error);
        }

        abortControllersRef.current.delete(abortController);
        throw error;
      }
    },
    [maxRetries, timeoutMs, backoffMultiplier, initialBackoffMs, onError, onSuccess, onRetryAttempt]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    execute,
    isLoading,
    error,
    attemptCount,
    clearError,
  };
}

/**
 * Función auxiliar para determinar el tipo de error
 */
export function getErrorType(error: Error): 'timeout' | 'network' | 'other' {
  if (error instanceof TimeoutError) {
    return 'timeout';
  }
  if (error instanceof RetryError && error.lastError instanceof TimeoutError) {
    return 'timeout';
  }
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return 'network';
  }
  return 'other';
}

/**
 * Función auxiliar para obtener mensaje de error amigable
 */
export function getErrorMessage(error: Error): string {
  const errorType = getErrorType(error);

  switch (errorType) {
    case 'timeout':
      return 'La solicitud tardó demasiado tiempo. Por favor, intenta nuevamente o recarga la página.';
    case 'network':
      return 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.';
    default:
      return error.message || 'Ocurrió un error inesperado. Por favor, intenta nuevamente.';
  }
}
