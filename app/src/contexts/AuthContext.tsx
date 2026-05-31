"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { userProfileService } from "@/lib/services/userProfileService";
import { authService } from "@/lib/services/authService";
import { UserProfile, AuthUser } from "@/lib/types";
import { SessionStore } from "@/lib/auth/SessionStore";
import { RefreshScheduler } from "@/lib/auth/refreshScheduler";
import {
  getFromLocalStorage,
  saveToLocalStorage,
  clearLocalStorage,
  validateProfileInBackground,
} from "./authStorage";

// Bootstrap del SessionStore y RefreshScheduler (idempotente — solo se ejecuta una vez).
// Se hace aquí, en el provider de más alto nivel con acceso a "use client".
if (typeof window !== "undefined") {
  SessionStore.bootstrap();
  RefreshScheduler.start();
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isLoggingOut: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provider que maneja autenticación globalmente
 * - Una sola instancia para toda la app
 * - localStorage para caché
 * - Evita requests duplicadas
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isLoggingOutRef = useRef(false);
  // Ref guard para evitar doble init (React StrictMode en dev ejecuta effects 2x)
  const initializingRef = useRef(false);

  /**
   * Intentar obtener perfil con retry.
   * Cubre el caso donde el access token está expirado y Supabase
   * aún no completó el refresh cuando se hace la primera llamada.
   */
  const fetchProfileWithRetry = useCallback(
    async (maxRetries = 2): Promise<UserProfile | null> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const freshProfile = await userProfileService.getUserProfile();
          if (freshProfile) return freshProfile;
        } catch (err) {
          console.error(
            `AuthContext: Profile fetch attempt ${attempt + 1} failed:`,
            err,
          );
        }
        // Delay progresivo antes de reintentar (500ms, 1000ms)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
      return null;
    },
    [],
  );

  useEffect(() => {
    const initializeAuth = async () => {
      // Guard con ref: prevenir ejecución concurrente (StrictMode en dev)
      if (initializingRef.current) return;
      initializingRef.current = true;

      try {
        // Solo en cliente - verificar localStorage
        if (typeof window === "undefined") {
          setLoading(false);
          setInitialized(true);
          return;
        }

        // Paso 1: Intentar obtener del localStorage (sin delay)
        const cachedProfile = getFromLocalStorage();
        if (cachedProfile) {
          setProfile(cachedProfile);
        }

        // Paso 2: Validar sesión con Supabase (usando el servicio robusto)
        const session = await authService.getSession();

        if (!session?.user) {
          // Sin sesión válida
          clearLocalStorage();
          setProfile(null);
          setUser(null);
          setLoading(false);
          setInitialized(true);
          return;
        }

        // Tenemos sesión válida
        setUser(session.user);

        // Paso 3: Si el caché es reciente, usarlo
        if (cachedProfile) {
          setLoading(false);
          setInitialized(true);
          // En background, validar que el caché siga siendo válido (sin bloquear)
          validateProfileInBackground(setProfile);
          return;
        }

        // Paso 4: No hay caché pero sesión válida - obtener perfil fresco con retry
        // eslint-disable-next-line no-console
        console.debug(
          "AuthContext: Session exists but no cache - fetching fresh profile",
        );
        const freshProfile = await fetchProfileWithRetry();
        if (freshProfile) {
          setProfile(freshProfile);
          saveToLocalStorage(freshProfile);
        } else {
          // Perfil no obtenido tras reintentos. Dejar profile null;
          // el interval de integridad lo reintentará más adelante.
          setProfile(null);
        }
        setLoading(false);
        setInitialized(true);
      } catch (err) {
        console.error("Error in AuthProvider init:", err);
        // Si hay error de refresh token, limpiar sesión
        if (err instanceof Error && err.message?.includes("Refresh Token")) {
          await authService.clearSession("error");
        }
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
        setInitialized(true);
      } finally {
        initializingRef.current = false;
      }
    };

    // Solo ejecutar si no está inicializado
    if (!initialized) {
      initializeAuth();
    }
  }, [initialized, fetchProfileWithRetry]);

  // Suscribirse al SessionStore para reflejar cambios de sesión en el estado React.
  // El store ya maneja: TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT, cross-tab, refresh proactivo.
  useEffect(() => {
    if (!initialized) return;

    let isMounted = true;
    let lastUserId: string | undefined;

    const unsub = SessionStore.subscribe(async (snapshot) => {
      if (!isMounted) return;

      if (snapshot.status === "anonymous") {
        // Sesión cerrada
        if (isLoggingOutRef.current) return; // en proceso de logout voluntario
        setUser(null);
        setProfile(null);
        clearLocalStorage();
        lastUserId = undefined;
        return;
      }

      if (snapshot.session?.user) {
        const sessionUser = snapshot.session.user;
        setUser((prev) => {
          if (!prev || prev.id !== sessionUser.id) return sessionUser;
          return prev;
        });

        // Refrescar perfil cuando cambia el usuario (SIGNED_IN desde otra cuenta)
        const userChanged = lastUserId !== sessionUser.id;
        lastUserId = sessionUser.id;

        if (userChanged && !getFromLocalStorage()) {
          try {
            const freshProfile = await userProfileService.getUserProfile();
            if (freshProfile && isMounted) {
              setProfile(freshProfile);
              saveToLocalStorage(freshProfile);
            }
          } catch (err) {
            console.error(
              "AuthContext: Error fetching profile on sign in:",
              err,
            );
          }
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [initialized]);

  // Listener para detectar borrado de datos del sitio desde otra pestaña o manualmente
  useEffect(() => {
    if (!initialized) return;

    let isMounted = true;

    /**
     * Listener de eventos storage que se ejecuta cuando se cambia localStorage en otra pestaña
     * o cuando se borran datos del sitio
     */
    const handleStorageChange = (e: StorageEvent) => {
      if (!isMounted) return;

      // Si el evento es sobre las keys de autenticación
      if (
        e.key?.includes("sb-") ||
        e.key?.includes("auth") ||
        e.key === null // null key significa que se limpió todo localStorage
      ) {
        console.warn(
          "AuthContext: El almacenamiento fue limpiado o modificado externamente",
        );

        // Detectamos que el storage fue modificado externamente
        // Validar inmediatamente con Supabase si aún hay sesión válida
        authService
          .getSession()
          .then((session) => {
            if (!session?.user && isMounted) {
              console.warn(
                "AuthContext: No se encontró sesión tras limpiar el almacenamiento",
              );
              setUser(null);
              setProfile(null);
              clearLocalStorage();
            }
          })
          .catch((err) => {
            console.error(
              "AuthContext: Error validating session after storage clear:",
              err,
            );
            if (isMounted) {
              setUser(null);
              setProfile(null);
              clearLocalStorage();
            }
          });
      }
    };

    /**
     * Listener para detectar inconsistencias entre estado en memoria y storage.
     * Ahora también actúa como mecanismo de RECUPERACIÓN: si `user` es null
     * pero la sesión de Supabase es válida, restaura el estado.
     */
    const validateSessionIntegrity = async () => {
      if (!isMounted) return;

      // CASO 1: user es null - intentar recuperar sesión si existe
      if (!user?.id) {
        try {
          const session = await authService.getSession();
          if (session?.user && isMounted) {
            // eslint-disable-next-line no-console
            console.debug("AuthContext: Recovering user from valid session");
            setUser(session.user);
            // Intentar recuperar o refrescar perfil
            const freshProfile = await userProfileService.getUserProfile();
            if (freshProfile && isMounted) {
              setProfile(freshProfile);
              saveToLocalStorage(freshProfile);
            }
          }
        } catch (err) {
          // Error de red - no hacer nada, re-intentar en el próximo ciclo
          console.error("AuthContext: Error recovering session:", err);
        }
        return;
      }

      // CASO 2: user existe - verificar consistencia con el caché de perfil
      const cachedProfile = getFromLocalStorage();

      if (!cachedProfile) {
        // El caché expiró o fue borrado. Antes de limpiar todo, validar con Supabase
        try {
          const session = await authService.getSession();
          if (session?.user) {
            // La sesión sigue válida - refrescar caché en background y actualizar estado React
            // eslint-disable-next-line no-console
            console.debug(
              "AuthContext: Cache expired but session valid - refreshing cache",
            );
            validateProfileInBackground((p) => {
              if (isMounted) setProfile(p);
            });
          } else {
            // Realmente no hay sesión
            console.warn(
              "AuthContext: No session and no cache - clearing state",
            );
            if (isMounted) {
              setUser(null);
              setProfile(null);
              clearLocalStorage();
            }
          }
        } catch (err) {
          console.error("AuthContext: Error during integrity check:", err);
          // En caso de error de red, NO limpiar estado (podría ser un problema temporal)
        }
      }
    };

    // Agregar listener de storage
    window.addEventListener("storage", handleStorageChange);

    // Validar integridad cada 5 minutos cuando hay usuario (onAuthStateChange ya cubre cambios reales)
    const integrityInterval = setInterval(
      () => {
        if (isMounted) {
          validateSessionIntegrity();
        }
      },
      5 * 60 * 1000,
    );

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(integrityInterval);
    };
  }, [initialized, user?.id]);

  const refreshProfile = async () => {
    try {
      const freshProfile = await userProfileService.getUserProfile();
      if (freshProfile) {
        setProfile(freshProfile);
        saveToLocalStorage(freshProfile);
        return freshProfile;
      }
      return null;
    } catch (err) {
      console.error("Error refreshing profile:", err);
      return null;
    }
  };

  /**
   * Cierre de sesión global.
   * Activa el overlay inmediatamente ANTES de limpiar la sesión,
   * evitando el flash de contenido no autenticado.
   */
  const signOut = useCallback(async () => {
    // Activar overlay inmediatamente (sincrónico)
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);

    // Fallback de seguridad: si clearSession se bloquea (navigator.lock ocupado u otro
    // error silencioso), forzamos el redirect a los 6 s para que el overlay no quede infinito.
    const fallbackTimer = setTimeout(() => {
      console.warn("[Auth] signOut fallback: forzando redirect tras timeout");
      window.location.href = "/auth/login";
    }, 6000);

    try {
      await authService.clearSession("user-logout");
    } catch (error) {
      console.error("Error durante logout:", error);
      window.location.href = "/auth/login";
    } finally {
      clearTimeout(fallbackTimer);
    }
  }, []);

  const value: AuthContextType = {
    user,
    profile,
    loading,
    error,
    isLoggingOut,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {isLoggingOut && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
          aria-live="assertive"
        >
          <div className="flex flex-col items-center gap-3">
            <svg
              className="animate-spin h-8 w-8 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm font-medium text-gray-600">
              Cerrando sesión…
            </span>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook para usar el contexto de autenticación
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
