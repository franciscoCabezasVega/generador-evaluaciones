import { supabase } from "../supabase";
import { invalidateSessionCache, getSessionViaManager, refreshSessionViaManager } from "../fetchAuth";

/**
 * Limpiar datos de sesión sin hacer redirect
 * Se usa internamente por otros métodos
 */
/** Limpia localStorage de claves de sesión de Supabase. Siempre seguro de llamar. */
function clearSessionStorage() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes("sb-") || key?.includes("auth")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

async function cleanSessionData() {
  try {
    // Invalidar caché de sesión antes de limpiar
    invalidateSessionCache();

    // supabase.auth.signOut usa navigator.lock internamente.
    // Si el lock está ocupado (auto-refresh en curso), puede bloquearse indefinidamente.
    // Limitamos la espera a 3 s; si se excede, limpiamos localStorage directamente.
    const signOutWithTimeout = Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);

    await signOutWithTimeout.catch((err) => {
      console.warn("Error during signOut (ignored):", err);
    });
  } catch (error) {
    console.error("Error cleaning session data:", error);
  } finally {
    // Siempre limpiar localStorage, incluso si signOut tardó o falló
    clearSessionStorage();
  }
}

/**
 * Servicio de autenticación con manejo robusto de errores de refresh token
 */
export const authService = {
  /**
   * Obtener sesión actual a través del SessionManager (con caché, sin competir por lock).
   */
  async getSession() {
    try {
      const { data, error } = await getSessionViaManager();

      if (error?.message?.includes("Refresh Token")) {
        console.warn("Refresh token error, clearing session");
        await cleanSessionData();
        return null;
      }

      return data.session;
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes("Refresh Token")) {
        console.warn("Caught refresh token error, clearing session");
        await cleanSessionData();
      }
      return null;
    }
  },

  /**
   * Obtener usuario actual con manejo robusto
   * Deriva del SessionManager para evitar adquirir navigator.lock dos veces.
   */
  async getUser() {
    try {
      const { data, error } = await getSessionViaManager();

      if (error?.message?.includes("Refresh Token")) {
        console.warn("Refresh token error getting user, clearing session");
        await cleanSessionData();
        return null;
      }

      return data.session?.user || null;
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes("Refresh Token")) {
        console.warn("Caught refresh token error, clearing session");
        await cleanSessionData();
      }
      return null;
    }
  },

  /**
   * Limpiar sesión completamente y redirigir
   * @param reason - Razón por la que se expira:
   *   'timeout' | 'inactive' | 'error' | 'user-logout' | 'refresh_failed' | boolean (legacy, true = inactive)
   * @returns Promise que se resuelve después de la limpieza (antes del redirect)
   */
  async clearSession(
    reason?:
      | "timeout"
      | "inactive"
      | "error"
      | "user-logout"
      | "refresh_failed"
      | boolean,
  ) {
    try {
      // Limpiar todos los datos de sesión (await para asegurar limpieza completa)
      await cleanSessionData();

      // Determinar la razón (mantener backward compatibility con boolean)
      let reasonStr: string | undefined;
      if (reason === true) {
        reasonStr = "inactive"; // true = inactividad (legacy)
      } else if (typeof reason === "string") {
        reasonStr = reason;
      }

      console.warn("Session cleared, reason:", reasonStr);

      // Construir URL con parámetros
      const params = new URLSearchParams();

      // Solo mostrar modal de sesión expirada si NO es logout voluntario
      if (reasonStr !== "user-logout") {
        params.set("sessionExpired", "true");
        if (reasonStr) {
          params.set("reason", reasonStr);
        }
      }

      const redirectUrl = `/auth/login?${params.toString()}`;
      window.location.href = redirectUrl;
    } catch (error) {
      console.error("Error clearing session:", error);
      // Forzar redirect incluso si hay error
      window.location.href = "/auth/login";
    }
  },

  /**
   * Verificar si hay sesión válida
   */
  async isSessionValid() {
    const session = await this.getSession();
    return !!session?.user?.id;
  },

  /**
   * Refrescar token manualmente
   */
  async refreshToken() {
    try {
      const { data, error } = await refreshSessionViaManager();

      if (error?.message?.includes("Refresh Token")) {
        console.warn("Cannot refresh token, session expired");
        await cleanSessionData();
        return null;
      }

      // Invalidar caché para forzar uso de la nueva sesión
      if (data.session) {
        invalidateSessionCache();
      }

      return data.session;
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes("Refresh Token")) {
        await cleanSessionData();
      }
      return null;
    }
  },

  /**
   * Refrescar token de forma silenciosa sin mostrar errores
   * Usado internamente para mantener la sesión activa
   *
   * Incluye un timeout de 10s para evitar que navigator.lock (Supabase internamente)
   * bloquee indefinidamente después de inactividad prolongada.
   */
  async silentRefreshToken() {
    try {
      // Pasa por SessionManager.refreshSession() — coalesce + timeout 10s integrados.
      // Sin coalesce, múltiples retries simultáneos disparaban N refreshes en paralelo,
      // todos compitiendo por navigator.lock → timeouts en cascada.
      const { data, error } = await refreshSessionViaManager();

      if (error?.message?.includes("Refresh Token")) {
        console.warn("Silent refresh failed: session expired");
        await cleanSessionData();
        return null;
      }

      if (data.session) {
        console.warn("Token refreshed silently");
        // Invalidar caché para forzar uso de la nueva sesión
        invalidateSessionCache();
        return data.session;
      }

      return null;
    } catch (error) {
      // Log silencioso para no alertar al usuario
      // eslint-disable-next-line no-console
      console.debug("Silent token refresh error:", error);
      return null;
    }
  },

  /**
   * Obtener sesión con intento de renovación automática
   * Useful para validar sesión antes de operaciones críticas
   */
  async getSessionWithRefresh() {
    try {
      // Primero intentar obtener la sesión actual
      const session = await this.getSession();

      if (!session?.user) {
        return null;
      }

      // Luego intenta refrescar silenciosamente en background (sin bloquear)
      this.silentRefreshToken().catch((err) => {
        // eslint-disable-next-line no-console
        console.debug("Background token refresh failed:", err);
      });

      return session;
    } catch (error) {
      console.error("Error in getSessionWithRefresh:", error);
      return null;
    }
  },

  /**
   * Validar que el token es válido y no está próximo a expirar
   * @param bufferSeconds - Segundos de margen antes de considerar el token expirado (default: 60)
   */
  async isTokenValid(bufferSeconds: number = 60): Promise<boolean> {
    try {
      const { data, error } = await getSessionViaManager();

      if (error || !data.session?.user) {
        return false;
      }

      // Verificar si el token expira pronto
      const expiresAt = data.session.expires_at;
      const now = Math.floor(Date.now() / 1000);

      if (expiresAt && expiresAt - now < bufferSeconds) {
        console.warn("Token expiring soon, attempting refresh");
        const refreshed = await this.silentRefreshToken();
        return !!refreshed;
      }

      return true;
    } catch (error) {
      console.error("Error validating token:", error);
      return false;
    }
  },
};
