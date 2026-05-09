import { useRouter } from "next/navigation";
import { useCallback, useRef, useEffect } from "react";
import { authenticatedFetch } from "@/lib/fetchAuth";
import { isSessionExpiredError } from "@/lib/utils";
import { authService } from "@/lib/services/authService";
import { TimeoutError } from "@/lib/withTimeout";
import { abortableDelay } from "@/lib/withRetry";

/**
 * Hook para hacer fetches autenticados de forma segura
 *
 * Estrategia de resiliencia simplificada:
 * - Timeout de 10 segundos por request (configurable)
 * - 1 reintento automático con 2s de backoff para errores de red/timeout
 * - Sin auto-reload: si falla, muestra error y deja al usuario decidir
 * - Manejo de 401/403 con refresh de token (1 intento)
 * - Cancela requests pendientes al desmontar componente
 * - Delays de reintento son cancelables al abortar/desmontar
 *
 * Nota: El timeout por inactividad es manejado por useSessionTimeoutManager
 *
 * Uso:
 * const { safeFetch } = useSafeAuthFetch();
 * const response = await safeFetch('/api/endpoint');
 */
export function useSafeAuthFetch() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const abortControllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      isMountedRef.current = false;
      // Abortar todas las requests pendientes al desmontar
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
    };
  }, []);

  const safeFetch = useCallback(
    async (
      url: string,
      options?: RequestInit,
      retryCount = 0,
      timeoutMs?: number,
    ): Promise<Response> => {
      // Configuración dinámica según método HTTP:
      // - Operaciones de escritura requieren más tiempo y más reintentos
      // - Lecturas son más rápidas y menos propensas a timeout
      const method = ((options?.method as string) || "GET").toUpperCase();
      const isWriteOperation = ["POST", "PATCH", "PUT", "DELETE"].includes(
        method,
      );
      const MAX_RETRIES = isWriteOperation ? 3 : 2;
      const effectiveTimeout = timeoutMs ?? (isWriteOperation ? 30000 : 15000);
      // Backoff exponencial: 2s → 4s → 8s → 16s (máx)
      const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 16000);

      // Si el caller ya pasó un signal abortado, salir inmediatamente
      const callerSignal = options?.signal as AbortSignal | undefined;
      if (callerSignal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      // Crear AbortController con timeout nativo
      const abortController = new AbortController();
      abortControllersRef.current.add(abortController);

      // Si el caller pasó un signal externo (e.g. cleanup de useEffect),
      // propagar su abort al controller interno para cancelar la request.
      let onCallerAbort: (() => void) | undefined;
      if (callerSignal) {
        onCallerAbort = () => abortController.abort();
        callerSignal.addEventListener("abort", onCallerAbort, { once: true });
      }

      // Timeout propio que aborta la request
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, effectiveTimeout);

      // Promise que se rechaza cuando el AbortController dispara.
      // Necesaria porque authenticatedFetch puede quedarse bloqueada en
      // supabase.auth.getSession() (navigator.locks) y el abort signal
      // solo cancela el fetch nativo, no la obtención de sesión.
      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () =>
          reject(new DOMException("The operation was aborted.", "AbortError"));
        if (abortController.signal.aborted) {
          onAbort();
        } else {
          abortController.signal.addEventListener("abort", onAbort, {
            once: true,
          });
        }
      });

      try {
        const response = await Promise.race([
          authenticatedFetch(url, {
            ...options,
            signal: abortController.signal,
          }),
          abortPromise,
        ]);

        clearTimeout(timeoutId);
        if (onCallerAbort && callerSignal) {
          callerSignal.removeEventListener("abort", onCallerAbort);
        }
        abortControllersRef.current.delete(abortController);

        // Si la respuesta es 401 o 403, intentar refresh de token una vez
        if (
          (response.status === 401 || response.status === 403) &&
          retryCount === 0
        ) {
          console.warn(
            `Got ${response.status} status, attempting token refresh...`,
          );

          const newSession = await authService.silentRefreshToken();

          if (newSession) {
            // eslint-disable-next-line no-console
            console.debug("Token refreshed, retrying request");
            return safeFetch(url, options, 1, effectiveTimeout);
          } else {
            console.warn("Token refresh failed, session lost");
            if (isMountedRef.current) {
              await authService.clearSession("error");
              router.push("/auth/login");
            }
            throw new Error("Sesión expirada. Inicia sesión nuevamente.");
          }
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (onCallerAbort && callerSignal) {
          callerSignal.removeEventListener("abort", onCallerAbort);
        }
        abortControllersRef.current.delete(abortController);

        // Si el componente se desmontó, ignorar silenciosamente
        if (!isMountedRef.current) {
          throw error instanceof Error ? error : new Error(String(error));
        }

        // AbortError puede ser por timeout interno, signal del caller, o desmontaje
        if (error instanceof DOMException && error.name === "AbortError") {
          // Si el caller canceló la request (e.g. cleanup de useEffect / navegación),
          // propagar AbortError tal cual para que el caller lo filtre
          if (callerSignal?.aborted) {
            throw error;
          }

          // Fue nuestro timeout interno — reintentar si quedan intentos
          if (isMountedRef.current && retryCount < MAX_RETRIES) {
            console.warn(
              `Request timeout (intento ${retryCount + 1}/${MAX_RETRIES + 1}), reintentando en ${retryDelay / 1000}s...`,
            );
            try {
              await abortableDelay(retryDelay, callerSignal);
            } catch {
              // Si el delay fue abortado (navegación/desmontaje), propagar AbortError
              throw new DOMException(
                "The operation was aborted.",
                "AbortError",
              );
            }
            return safeFetch(url, options, retryCount + 1, effectiveTimeout);
          }
          // Timeout agotado sin reintentos disponibles
          throw new TimeoutError(
            `La solicitud tardó más de ${effectiveTimeout / 1000}s. Verifica tu conexión e intenta de nuevo.`,
          );
        }

        // Errores transitorios de lock de sesión — hasta 3 reintentos con delay incremental
        // Ocurre al volver de otra pestaña: Supabase auto-refresh mantiene el lock
        if (error instanceof Error && error.name === "SessionLockError") {
          const SESSION_LOCK_MAX_RETRIES = 3;
          if (retryCount < SESSION_LOCK_MAX_RETRIES) {
            // Delay incremental: 2s, 3s, 4s — da tiempo al auto-refresh de terminar
            const delay = 2000 + retryCount * 1000;
            console.warn(
              `Session lock busy (intento ${retryCount + 1}/${SESSION_LOCK_MAX_RETRIES + 1}), reintentando en ${delay}ms...`,
            );
            try {
              await abortableDelay(delay, callerSignal);
            } catch {
              throw new DOMException(
                "The operation was aborted.",
                "AbortError",
              );
            }
            return safeFetch(url, options, retryCount + 1, effectiveTimeout);
          }

          // Todos los reintentos agotados — dejar que la UI muestre un banner de error
          console.error(
            "SessionLockError persistente después de 4 intentos. Propagando error para que la UI lo maneje.",
          );
          throw new Error(
            "La sesión está ocupada. Espera unos segundos e intenta de nuevo.",
          );
        }

        // Sesión no disponible temporalmente — intentar refresh
        if (
          error instanceof Error &&
          error.message.includes("Session not available")
        ) {
          console.warn("Session not available, attempting silent refresh...");
          const newSession = await authService.silentRefreshToken();
          if (newSession && retryCount === 0) {
            return safeFetch(url, options, 1, effectiveTimeout);
          }
          // Si el refresh falla, sí es sesión expirada
          await authService.clearSession("error");
          if (isMountedRef.current) {
            router.push("/auth/login");
          }
          throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        }

        // Error de sesión expirada (errores reales de auth, no transitorios)
        if (isSessionExpiredError(error)) {
          console.warn("Session expired error detected");
          const newSession = await authService.silentRefreshToken();
          if (newSession && retryCount === 0) {
            return safeFetch(url, options, 1, effectiveTimeout);
          }
          await authService.clearSession("error");
          if (isMountedRef.current) {
            router.push("/auth/login");
          }
          throw new Error("Sesión expirada. Inicia sesión nuevamente.");
        }

        // Errores de red - reintentar una vez
        if (retryCount < MAX_RETRIES && shouldRetryError(error)) {
          console.warn(
            `Error de red (intento ${retryCount + 1}/${MAX_RETRIES + 1}), reintentando en ${retryDelay / 1000}s...`,
          );
          try {
            await abortableDelay(retryDelay, callerSignal);
          } catch {
            // Si el delay fue abortado, propagar AbortError
            throw new DOMException("The operation was aborted.", "AbortError");
          }
          return safeFetch(url, options, retryCount + 1, effectiveTimeout);
        }

        throw error;
      }
    },
    [router],
  );

  return { safeFetch };
}

/**
 * Determinar si un error debe ser reintentado
 */
function shouldRetryError(error: unknown): boolean {
  if (error instanceof Error) {
    // No reintentar errores de validación o autorización
    if (error.message.includes("401") || error.message.includes("403")) {
      return false;
    }
    // Reintentar errores de red o conexión
    if (
      error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("ERR_")
    ) {
      return true;
    }
  }
  return false;
}
