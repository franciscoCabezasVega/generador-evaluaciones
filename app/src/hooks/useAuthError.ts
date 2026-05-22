import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Hook para manejar errores de autenticación y recuperarse de ellos
 * Detecta errores de refresh token y limpia la sesión si es necesario
 */
export function useAuthError() {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Escuchar errores de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Si no hay sesión pero el usuario intenta hacer algo, puede haber un error de refresh token
      if (event === "SIGNED_OUT" && session === null) {
        setHasError(false);
      }
    });

    // Interceptar errores de refresh token
    const originalFetch = window.fetch;

    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(window, args);

      // Detectar error 401 o 403 que podrían ser por refresh token
      if (response.status === 401 || response.status === 403) {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const clonedResponse = response.clone();
          try {
            const data = await clonedResponse.json();
            if (data.error?.message?.includes("Refresh Token")) {
              console.warn(
                "Error de refresh token detectado, limpiando sesión",
              );
              setHasError(true);
              await supabase.auth.signOut();
            }
          } catch {
            // No es JSON, ignorar
          }
        }
      }

      return response;
    } as typeof fetch;

    return () => {
      window.fetch = originalFetch;
      subscription?.unsubscribe();
    };
  }, []);

  return { hasError, setHasError };
}
