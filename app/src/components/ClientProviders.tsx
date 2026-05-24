"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type ReactNode } from "react";
import { TourProvider } from "@/contexts/TourContext";
import { MutationQueueProvider } from "@/contexts/MutationQueueContext";
import { FeedbackButton } from "@/components/FeedbackButton";
import { useAuth } from "@/contexts/AuthContext";

// TourOverlay es un componente visual con default export — lazy-loaded tras hidratación
const TourOverlay = dynamic(() => import("@/components/TourOverlay"), {
  ssr: false,
});

export default function ClientProviders({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();

  // Watchdog: si auth loading se queda colgado más de 15s hace reload automático.
  // Cubre casos donde el token lock o la sesión de Supabase no resuelve.
  // Guard sessionStorage: si ya se recargó una vez en esta sesión no vuelve a
  // recargar para evitar loop infinito cuando la causa es persistente (offline,
  // Supabase caído, etc.).
  const WATCHDOG_KEY = "auth_watchdog_reloaded";
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!authLoading) {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      // Auth resolvió correctamente — resetear guard para permitir watchdog
      // en futuros bloqueos de la misma sesión.
      try {
        sessionStorage.removeItem(WATCHDOG_KEY);
      } catch {
        /* SSR / private mode */
      }
      return;
    }
    // No recargar si ya lo hicimos antes en esta sesión de navegador.
    try {
      if (sessionStorage.getItem(WATCHDOG_KEY)) {
        console.warn(
          "[auth] Watchdog: ya se recargó una vez, omitiendo para evitar loop.",
        );
        return;
      }
    } catch {
      /* SSR / private mode: continuar con el watchdog normalmente */
    }
    watchdogRef.current = setTimeout(() => {
      console.warn(
        "[auth] Watchdog: carga de sesión bloqueada >15s, recargando página...",
      );
      try {
        sessionStorage.setItem(WATCHDOG_KEY, "1");
      } catch {
        /* SSR / private mode */
      }
      window.location.reload();
    }, 15_000);
    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [authLoading]);

  // Defensa en profundidad: silenciar unhandledRejection de getSession lock
  // (no son fatales, los callers ya hacen retry / fallback).
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      // DOMException (lanzado por fetchAuth.ts para lock timeouts) no hereda
      // de Error en todos los entornos — comprobamos ambos tipos.
      const message =
        reason instanceof Error || reason instanceof DOMException
          ? (reason as { message: string }).message
          : typeof reason === "string"
            ? reason
            : "";
      if (
        message.includes("getSession timed out") ||
        message.includes("refreshSession timed out") ||
        message.includes("silentRefreshToken timeout")
      ) {
        console.warn("[auth] swallowed lock timeout:", message);
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return (
    <MutationQueueProvider>
      <TourProvider>
        {children}
        <TourOverlay />
        <FeedbackButton />
      </TourProvider>
    </MutationQueueProvider>
  );
}
