"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Componente sin UI que sincroniza la preferencia de tema almacenada
 * en el perfil del usuario con next-themes.
 * Debe montarse dentro de AuthProvider y dentro de ThemeProvider.
 */
export function ThemeSync() {
  const { profile } = useAuth();
  const { setTheme } = useTheme();
  // Ref que registra qué valor ya fue aplicado para evitar re-aplicar en cada render
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    const pref = profile?.theme_preference;
    if (!pref || syncedRef.current === pref) return;
    syncedRef.current = pref;
    setTheme(pref);
  }, [profile?.theme_preference, setTheme]);

  return null;
}
