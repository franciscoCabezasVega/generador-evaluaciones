"use client";

import React, { useEffect, useState, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import { Button } from "@/components/ui/button";

interface SessionExpiredModalProps {
  isOpen: boolean;
  reason?: "timeout" | "inactive" | "error" | "unknown";
  onRefresh?: () => void;
}

/**
 * Modal que se muestra cuando la sesión ha expirado completamente
 * Se diferencia de SessionExpirationModal (que es una advertencia previa)
 *
 * Casos de uso:
 * - Sesión expiró por inactividad (30 minutos)
 * - Token refrescado falló
 * - Error inesperado durante operación
 * - Sesión revocada en otro dispositivo
 */
export default function SessionExpiredModal({
  isOpen,
  reason = "unknown",
  onRefresh,
}: SessionExpiredModalProps) {
  const [autoClose, setAutoClose] = useState(false);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
      return;
    }

    // Cerrar automáticamente después de 8 segundos si no hay interacción
    autoCloseTimerRef.current = setTimeout(() => {
      setAutoClose(true);
    }, 8000);

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [isOpen]);

  // Redirigir automáticamente cuando autoClose sea true
  useEffect(() => {
    if (!autoClose) return;

    // Redirigir después de 2 segundos adicionales para que el usuario vea el mensaje
    redirectTimerRef.current = setTimeout(() => {
      // Usar onRefresh para que el padre controle el cierre del modal
      if (onRefresh) {
        onRefresh();
      } else {
        // Fallback: navegación directa con window.location para garantizar full reload
        window.location.href = "/auth/login";
      }
    }, 2000);

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [autoClose, onRefresh]);

  if (!isOpen) return null;

  const getTitle = () => {
    switch (reason) {
      case "timeout":
        return "Sesión Expirada";
      case "inactive":
        return "Sesión Cerrada por Inactividad";
      case "error":
        return "Error de Seguridad";
      default:
        return "Sesión Expirada";
    }
  };

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      // Fallback: navegación directa para garantizar full reload
      window.location.href = "/auth/login";
    }
  };

  const title = getTitle();

  return (
    <Modal isOpen={isOpen} title={title} onClose={() => {}} size="md">
      <div className="space-y-4">
        {/* Alert Box - Estilo similar a la captura */}
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-700" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-900">
              Tu sesión ha expirado
            </p>
            <p className="text-sm text-yellow-800">
              Por favor, inicia sesión nuevamente
            </p>
          </div>
        </div>

        {/* Auto-close countdown */}
        {autoClose && (
          <p className="text-xs text-gray-500 text-center">
            Redirigiendo a login en unos momentos...
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
        <Button
          onClick={handleRefresh}
          variant="default"
          className="flex-1"
          disabled={autoClose}
        >
          {autoClose ? "Iniciando sesión..." : "Iniciar Sesión Nuevamente"}
        </Button>
      </div>
    </Modal>
  );
}
