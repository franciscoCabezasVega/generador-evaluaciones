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
 * IMPORTANTE: reacciona únicamente a la TRANSICIÓN authenticated → anonymous.
 * Si el status inicial ya es 'anonymous' (usuario nunca autenticado / en /auth/login),
 * NO se dispara clearSession — eso causaría un loop infinito de hard-reloads.
 *
 * No renderiza nada visible.
 */
export function SessionChecker() {
  const isMountedRef = useRef(true);
  // Rastrear el estado previo para detectar transiciones, no estados iniciales.
  const prevStatusRef = useRef<
    "unknown" | "authenticated" | "anonymous" | null
  >(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Suscribirse al store: si la sesión muere MID-SESSION, forzar logout limpio.
    // La notificación inicial llega vía queueMicrotask — en ese punto prevStatusRef
    // es null, así que nunca activa el redirect aunque el estado ya sea 'anonymous'.
    const unsub = SessionStore.subscribe((snapshot) => {
      if (!isMountedRef.current) return;

      const wasAuthenticated = prevStatusRef.current === "authenticated";
      prevStatusRef.current = snapshot.status;

      if (
        snapshot.status === "anonymous" &&
        wasAuthenticated && // Solo reaccionar a authenticated → anonymous (sesión expirada)
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
