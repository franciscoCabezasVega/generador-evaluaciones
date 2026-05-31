"use client";

import { useEffect, useRef } from "react";
import { SessionStore } from "@/lib/auth/SessionStore";
import { authService } from "@/lib/services/authService";
import { isVoluntarySignOut } from "@/lib/fetchAuth";

/**
 * SessionChecker — simplificado con el nuevo SessionStore reactivo.
 *
 * Responsabilidad reducida: solo redirigir al login cuando el store
 * detecta que la sesión pasó a 'anonymous' mientras el usuario estaba
 * activo. El refresh proactivo ya lo gestiona RefreshScheduler.
 *
 * No renderiza nada visible.
 */
export function SessionChecker() {
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Suscribirse al store: si la sesión muere, forzar logout limpio
    const unsub = SessionStore.subscribe((snapshot) => {
      if (!isMountedRef.current) return;
      if (
        snapshot.status === "anonymous" &&
        snapshot.updatedAt > 0 &&
        !isVoluntarySignOut() // Evitar doble-redirect en logout voluntario
      ) {
        // Sesión perdida mientras el usuario estaba activo → logout limpio
        authService.clearSession("refresh_failed").catch(() => {});
      }
    });

    return () => unsub();
  }, []);

  return null;
}

// Fin del archivo
