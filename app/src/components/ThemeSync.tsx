"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Componente sin UI que sincroniza la preferencia de tema almacenada
 * en el perfil del usuario con next-themes.
 * Debe montarse dentro de AuthProvider y dentro de ThemeProvider.
 */
export function ThemeSync() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!profile?.theme_preference) return;
    if (profile.theme_preference !== theme) {
      setTheme(profile.theme_preference);
    }
    // Solo sincronizar al cargar el perfil por primera vez, no en cada cambio de theme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.theme_preference]);

  return null;
}
