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
 */
export async function validateProfileInBackground(
  onUpdate?: (profile: UserProfile) => void,
) {
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
