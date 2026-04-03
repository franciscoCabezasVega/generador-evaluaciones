import { withTimeout } from './withTimeout';

export interface RetryConfig {
  maxRetries?: number; // Default: 3
  timeoutMs?: number; // Default: 10000
  backoffMultiplier?: number; // Default: 2 (exponential: 1s, 2s, 4s, 8s...)
  initialBackoffMs?: number; // Default: 1000
  onRetry?: (attempt: number, error: Error) => void; // Callback cuando reintentas
}

export class RetryError extends Error {
  constructor(
    message: string,
    public lastError: Error,
    public attempts: number
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

/**
 * Ejecutar una función con reintentos automáticos
 * Usa backoff exponencial entre reintentos
 * 
 * @param fn - Función que retorna una Promise
 * @param config - Configuración de reintentos
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeoutMs = 10000,
    backoffMultiplier = 2,
    initialBackoffMs = 1000,
    onRetry,
  } = config;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Ejecutar con timeout
      const result = await withTimeout(fn(), timeoutMs);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Si es el último intento, no reintentar más
      if (attempt === maxRetries) {
        throw new RetryError(
          `Failed after ${maxRetries} attempts: ${lastError.message}`,
          lastError,
          maxRetries
        );
      }

      // Calcular backoff exponencial
      const backoffMs = initialBackoffMs * Math.pow(backoffMultiplier, attempt - 1);

      // Callback para notificar reintento
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      console.warn(
        `Request failed (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs}ms...`,
        lastError.message
      );

      // Esperar antes de reintentar
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  // Este código nunca se alcanza debido a la lógica anterior, pero necesario para TypeScript
  throw new RetryError('Retry failed', lastError!, maxRetries);
}

/**
 * Ejecutar un fetch con reintentos automáticos
 * 
 * @param url - URL a hacer fetch
 * @param options - Opciones de fetch
 * @param config - Configuración de reintentos y timeout
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = {}
): Promise<Response> {
  return withRetry(
    () => fetch(url, options),
    config
  );
}
