'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTour } from '@/contexts/TourContext';
import { TOURS_METADATA } from '@/lib/tourConfig';
import Modal from '@/components/Modal';
import { Button } from '@/components/ui/button';

interface TourSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TourSelectionModal({ isOpen, onClose }: TourSelectionModalProps) {
  const router = useRouter();
  const { startTour } = useTour();

  const tourRoutes = {
    tasks: '/tasks',
    reports: '/reports',
    audit: '/audit-trail',
    feedback: undefined
  };

  const handleStartTour = (tourType: 'tasks' | 'reports' | 'audit' | 'feedback') => {
    // Cerrar el modal
    onClose();
    
    // Si hay una ruta, navegar primero
    if (tourRoutes[tourType as keyof typeof tourRoutes]) {
      router.push(tourRoutes[tourType as keyof typeof tourRoutes]!);
      
      // Iniciar el tour después de que la página se haya cargado
      setTimeout(() => {
        startTour(tourType);
      }, 500);
    } else {
      // Para feedback, iniciar directamente sin navegar
      startTour(tourType);
    }
  };

  return (
    <Modal isOpen={isOpen} title="🎯 Visita Guiada" onClose={onClose}>
      <p className="text-gray-600 mb-6">
        Elige una sección para comenzar una visita guiada interactiva. Aprenderás a usar todas las funcionalidades disponibles.
      </p>

      {/* Tour Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {(['tasks', 'reports', 'audit', 'feedback'] as const).map(tourType => {
          const metadata = TOURS_METADATA[tourType];
          return (
            <div
              key={tourType}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-lg hover:border-blue-300 transition-all flex flex-col"
            >
              <div className="text-4xl mb-2">{metadata.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{metadata.title}</h3>
              <p className="text-sm text-gray-600 mb-4 flex-1">{metadata.description}</p>
              <Button
                onClick={() => handleStartTour(tourType)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="sm"
              >
                Iniciar Tour
              </Button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t pt-4 flex justify-end">
        <Button
          variant="outline"
          onClick={onClose}
        >
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
