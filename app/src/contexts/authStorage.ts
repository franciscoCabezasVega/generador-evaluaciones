import { UserProfile } from "@/lib/types";

const STORAGE_KEY = "auth_user_profile";
const STORAGE_EXPIRY = "auth_user_profile_expiry";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

/**
 * Obtiene el perfil del caché local si es válido
 */
export function getFromLocalStorage(): UserProfile | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    const expiry = localStorage.getItem(STORAGE_EXPIRY);

    if (!cached || !expiry) return null;

    // Verificar si el caché expiró
    if (Date.now() > parseInt(expiry)) {
      clearLocalStorage();
      return null;
    }

    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Guarda el perfil en localStorage
 */
export function saveToLocalStorage(profile: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    localStorage.setItem(
      STORAGE_EXPIRY,
      (Date.now() + CACHE_DURATION).toString(),
    );
  } catch (err) {
    console.error("Error saving to localStorage:", err);
  }
}

/**
 * Limpia el caché local
 */
export function clearLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_EXPIRY);
  } catch {
    // Ignorar errores de localStorage
  }
}

/**
 * Valida el perfil en background sin bloquear la UI.
 * Si se provee un callback onUpdate, actualiza también el estado React.
 *
 * IMPORTANTE: Respeta el TTL del caché local para no ir a DB en cada
 * llamada (ej. TOKEN_REFRESHED, onAuthStateChange). Si el caché tiene
 * menos de BACKGROUND_REVALIDATE_MS, se omite la consulta a DB — esto
 * es la principal causa de los 90K seq_scans en user_profiles.
 */
const BACKGROUND_REVALIDATE_MS = 5 * 60 * 1000; // 5 minutos

export async function validateProfileInBackground(
  onUpdate?: (profile: UserProfile) => void,
) {
  // Si el caché de localStorage es reciente, no ir a la DB
  const expiry =
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_EXPIRY) : null;
  if (expiry) {
    const msUntilExpiry = parseInt(expiry) - Date.now();
    // El caché expira en CACHE_DURATION (30min) desde que se guardó.
    // Si queda más de (CACHE_DURATION - BACKGROUND_REVALIDATE_MS) de vida,
    // aún está "fresco" y no necesitamos revalidar.
    if (msUntilExpiry > CACHE_DURATION - BACKGROUND_REVALIDATE_MS) {
      return;
    }
  }

  try {
    const { userProfileService } =
      await import("@/lib/services/userProfileService");
    const freshProfile = await userProfileService.getUserProfile();
    if (freshProfile) {
      saveToLocalStorage(freshProfile);
      onUpdate?.(freshProfile);
    }
  } catch {
    // Si falla, mantener el caché anterior
  }
}
