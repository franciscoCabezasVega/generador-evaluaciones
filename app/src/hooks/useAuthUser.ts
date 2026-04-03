import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { userProfileService } from '@/lib/services/userProfileService';
import { UserProfile, AuthUser } from '@/lib/types';

const STORAGE_KEY = 'auth_user_profile';
const STORAGE_EXPIRY = 'auth_user_profile_expiry';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

/**
 * Hook que maneja la autenticación del usuario con caché local
 * - Primero intenta obtener del localStorage (instant)
 * - Luego valida con Supabase en background
 * - Evita requests múltiples a auth/v1/user
 */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Paso 1: Intentar obtener del localStorage (sin delay)
        const cachedProfile = getFromLocalStorage();
        if (cachedProfile) {
          setProfile(cachedProfile);
          setLoading(false);
        }

        // Paso 2: Validar sesión con Supabase (sin llamar a getUser si no es necesario)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          // Sin sesión válida
          clearLocalStorage();
          setProfile(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // Tenemos sesión válida
        setUser(session.user);

        // Paso 3: Si el caché es reciente y válido, usarlo
        if (cachedProfile) {
          setLoading(false);
          // En background, validar que el caché siga siendo válido
          validateProfileInBackground();
          return;
        }

        // Paso 4: Si no hay caché, obtener perfil fresco
        const freshProfile = await userProfileService.getUserProfile();
        if (freshProfile) {
          setProfile(freshProfile);
          saveToLocalStorage(freshProfile);
        } else {
          setProfile(null);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error in useAuthUser:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  return { user, profile, loading, error, refreshProfile: () => refreshProfileManually() };
}

/**
 * Obtiene el perfil del caché local si es válido
 */
function getFromLocalStorage(): UserProfile | null {
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
function saveToLocalStorage(profile: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    localStorage.setItem(STORAGE_EXPIRY, (Date.now() + CACHE_DURATION).toString());
  } catch (err) {
    console.error('Error saving to localStorage:', err);
  }
}

/**
 * Limpia el caché local
 */
function clearLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_EXPIRY);
  } catch {
    // Ignorar errores de localStorage
  }
}

/**
 * Valida el perfil en background sin bloquear la UI
 */
async function validateProfileInBackground() {
  try {
    const freshProfile = await userProfileService.getUserProfile();
    if (freshProfile) {
      saveToLocalStorage(freshProfile);
    }
  } catch {
    // Si falla, mantener el caché anterior
  }
}

/**
 * Refresca el perfil manualmente (cuando el usuario lo solicite)
 */
async function refreshProfileManually() {
  try {
    const freshProfile = await userProfileService.getUserProfile();
    if (freshProfile) {
      saveToLocalStorage(freshProfile);
      return freshProfile;
    }
    return null;
  } catch (err) {
    console.error('Error refreshing profile:', err);
    return null;
  }
}
