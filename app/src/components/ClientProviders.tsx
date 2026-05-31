"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { TourProvider } from "@/contexts/TourContext";
import { MutationQueueProvider } from "@/contexts/MutationQueueContext";
import { FeedbackButton } from "@/components/FeedbackButton";
import { installRechartsConsoleFilter } from "@/lib/rechartsConsoleFilter";

// Filtro idempotente de un warning cosmético de recharts en dev (ver archivo).
installRechartsConsoleFilter();

// TourOverlay es un componente visual con default export — lazy-loaded tras hidratación
const TourOverlay = dynamic(() => import("@/components/TourOverlay"), {
  ssr: false,
});

// El watchdog de 15s y los handlers de lock timeout se eliminaron porque
// ya no son necesarios: SessionStore elimina los locks del flujo normal y
// RefreshScheduler maneja el refresh proactivamente sin contención.
export default function ClientProviders({ children }: { children: ReactNode }) {
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
