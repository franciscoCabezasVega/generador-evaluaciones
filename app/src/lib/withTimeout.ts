/**
 * Ejecutar una promise con timeout
 * Si excede el timeout, rechaza con TimeoutError
 *
 * @param promise - Promise a ejecutar
 * @param timeoutMs - Timeout en milisegundos
 * @returns Promise que se rechaza si excede el timeout
 */
export class TimeoutError extends Error {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Ejecutar un fetch con timeout
 *
 * @param url - URL a hacer fetch
 * @param options - Opciones de fetch
 * @param timeoutMs - Timeout en milisegundos
 * @returns Response
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TimeoutError(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}
