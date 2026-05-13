"use client";

import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { TourProvider } from "@/contexts/TourContext";
import { MutationQueueProvider } from "@/contexts/MutationQueueContext";
import { FeedbackButton } from "@/components/FeedbackButton";

// TourOverlay es un componente visual con default export — lazy-loaded tras hidratación
const TourOverlay = dynamic(() => import("@/components/TourOverlay"), {
  ssr: false,
});

export default function ClientProviders({ children }: { children: ReactNode }) {
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
