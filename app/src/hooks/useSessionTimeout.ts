import { useEffect, useRef, useCallback } from "react";
import { authService } from "@/lib/services/authService";

/**
 * Hook que detecta inactividad y cierra la sesión automáticamente
 *
 * Rastreo de actividad:
 * - Clicks en la página
 * - Key presses
 * - Mouse movement
 *
 * @param timeout - Tiempo en milisegundos antes de cerrar sesión por inactividad (default: 30 minutos)
 * @param checkInterval - Intervalo para validar token en milisegundos (default: 5 minutos)
 */
export function useSessionTimeout(
  timeout: number = 30 * 60 * 1000, // 30 minutos
  checkInterval: number = 5 * 60 * 1000, // 5 minutos
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Reinicia el timeout de inactividad
   */
  const resetTimeout = useCallback(() => {
    // Limpiar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Establecer nuevo timeout
    timeoutRef.current = setTimeout(async () => {
      console.warn("Tiempo de sesión agotado por inactividad");
      await authService.clearSession("timeout");
    }, timeout);
  }, [timeout]);

  /**
   * Validar token periódicamente
   */
  const validateTokenPeriodically = useCallback(() => {
    checkIntervalRef.current = setInterval(async () => {
      const isValid = await authService.isTokenValid();

      if (!isValid) {
        console.warn("Validación del token fallida, limpiando sesión");
        await authService.clearSession("error");
      }
    }, checkInterval);
  }, [checkInterval]);

  /**
   * Manejador de eventos de actividad
   */
  const handleActivity = useCallback(() => {
    resetTimeout();
  }, [resetTimeout]);

  useEffect(() => {
    // Iniciar validación periódica de token
    validateTokenPeriodically();

    // Iniciar timeout de inactividad
    resetTimeout();

    // Rastrear actividad del usuario
    window.addEventListener("click", handleActivity);
    window.addEventListener("keypress", handleActivity);
    window.addEventListener("mousemove", handleActivity);

    // Cleanup
    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keypress", handleActivity);
      window.removeEventListener("mousemove", handleActivity);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [resetTimeout, handleActivity, validateTokenPeriodically]);
}
