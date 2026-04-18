'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { TourProvider } from '@/contexts/TourContext';
import { MutationQueueProvider } from '@/contexts/MutationQueueContext';
import { FeedbackButton } from '@/components/FeedbackButton';

// TourOverlay es un componente visual con default export — lazy-loaded tras hidratación
const TourOverlay = dynamic(() => import('@/components/TourOverlay'), { ssr: false });

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
