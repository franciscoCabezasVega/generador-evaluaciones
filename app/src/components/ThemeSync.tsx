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

    // No sobreescribir si ya hay una preferencia explícita en localStorage.
    // Esto evita revertir el tema al recargar cuando el caché del perfil está desactualizado.
    // ThemeSync aplica la preferencia del perfil solo en dispositivos/sesiones sin valor previo.
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem("theme")
        : null;
    if (stored) return;

    syncedRef.current = pref;
    setTheme(pref);
  }, [profile?.theme_preference, setTheme]);

  return null;
}
