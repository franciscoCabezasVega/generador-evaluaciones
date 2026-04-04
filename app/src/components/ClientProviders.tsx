'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { TourProvider } from '@/contexts/TourContext';
import { FeedbackButton } from '@/components/FeedbackButton';

// TourOverlay es un componente visual con default export — lazy-loaded tras hidratación
const TourOverlay = dynamic(() => import('@/components/TourOverlay'), { ssr: false });

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <TourProvider>
      {children}
      <TourOverlay />
      <FeedbackButton />
    </TourProvider>
  );
}
