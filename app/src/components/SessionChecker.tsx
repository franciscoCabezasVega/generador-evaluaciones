"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/lib/services/authService";

// Circuit breaker: número máximo de fallos consecutivos de refresh antes de
// forzar re-login. Definido en scope de módulo para evitar closure stale
// dentro del useEffect.
const MAX_CONSECUTIVE_FAILURES = 2;

/**
 * Componente que valida la sesión periódicamente en background
 * No renderiza nada, solo mantiene tokens frescos
 *
 * NOTA: El manejo de timeout por inactividad está en useSessionTimeoutManager
 * Este componente solo se encarga de validar y refrescar tokens periódicamente
 *
 * Debe colocarse en el layout.tsx dentro de AuthProvider para que funcione globalmente
 */
export function SessionChecker() {
  const router = useRouter();
  const { user } = useAuth();
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  // Contador de fallos consecutivos de refresh (circuit breaker).
  const consecutiveFailuresRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      // Reset circuit breaker counter al cerrar sesión / perder user.
      // Evita que un usuario que acumuló 1 fallo, hace logout y vuelve a
      // entrar, dispare el forzar re-login antes de tiempo en su nueva sesión.
      consecutiveFailuresRef.current = 0;
      return;
    }

    // Validar cada 10 minutos en lugar de 5 para reducir competencia
    const VALIDATION_INTERVAL = 10 * 60 * 1000;

    const performValidation = async () => {
      const now = Date.now();

      // No validar si ya se validó hace menos de 1 minuto
      if (now - lastCheckRef.current < 60000) {
        return;
      }

      // NUEVO: No validar si hay actividad reciente (últimos 30 segundos)
      // Esto evita competir con requests de la UI cuando el usuario está activo
      const { getTimeSinceLastActivity } = await import("@/lib/fetchAuth");
      if (getTimeSinceLastActivity() < 30000) {
        // Actividad reciente detectada, omitir validación
        return;
      }

      lastCheckRef.current = now;

      try {
        const isValid = await authService.isTokenValid(5 * 60);

        if (!isMountedRef.current) {
          return;
        }

        if (!isValid) {
          console.warn(
            "SessionChecker: Token validation failed, attempting refresh",
          );
          const refreshed = await authService.silentRefreshToken();

          if (!refreshed && isMountedRef.current) {
            consecutiveFailuresRef.current += 1;
            console.warn(
              `SessionChecker: Token refresh failed, session lost (${consecutiveFailuresRef.current}/${MAX_CONSECUTIVE_FAILURES})`,
            );

            // Circuit breaker: tras N fallos consecutivos asumimos que la
            // sesión está irrecuperable (lock atascado, refresh token
            // revocado, red cortada permanentemente, etc.). Forzamos
            // logout local + redirect al login para sacar al usuario del
            // estado bloqueado en vez de seguir reintentando.
            //
            // clearSession ya hace el redirect (window.location.href) con
            // el reason recibido, así que es la única fuente de verdad
            // para la URL de login. No hace falta un router.push extra.
            if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
              console.warn(
                "SessionChecker: Max consecutive refresh failures reached, forcing re-login",
              );
              consecutiveFailuresRef.current = 0;
              // clearSession ya atrapa sus propios errores y fuerza el
              // redirect — no necesitamos un try/catch adicional aquí.
              await authService.clearSession("refresh_failed");
            }
          } else if (refreshed && isMountedRef.current) {
            consecutiveFailuresRef.current = 0;
            console.warn("SessionChecker: Token renovado exitosamente");
          }
        } else if (isMountedRef.current) {
          consecutiveFailuresRef.current = 0;
          console.warn("SessionChecker: Validación del token exitosa");
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error(
            "SessionChecker: Error during session validation:",
            error,
          );
        }
      }
    };

    // Ejecutar validación inmediata
    performValidation();

    // Ejecutar periódicamente
    checkIntervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        performValidation();
      }
    }, VALIDATION_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [user?.id]);

  // Listener para detectar cuando storage es borrado (incluye limpieza manual del navegador)
  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;

    const handleStorageChange = (e: StorageEvent) => {
      if (!isMounted) return;

      // Si se borró toda la storage o alguna key de auth
      if (e.key?.includes("sb-") || e.key?.includes("auth") || e.key === null) {
        console.warn(
          "SessionChecker: Storage changed externally - validating session",
        );

        // Validar con Supabase en lugar de hacer reload
        authService
          .getSession()
          .then((session) => {
            if (!session?.user && isMountedRef.current) {
              console.warn(
                "SessionChecker: Session invalidated after storage clear",
              );
              // Redirigir al login sin reload usando router
              router.push(
                "/auth/login?sessionExpired=true&reason=storage_cleared",
              );
            }
            // Si la sesión sigue válida, no hacer nada (evitar reload innecesario)
          })
          .catch((err) => {
            console.error(
              "SessionChecker: Error validating after storage clear:",
              err,
            );
            // En caso de error de red, NO recargar - podría ser transitorio
          });
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [user?.id, router]);

  return null;
}
