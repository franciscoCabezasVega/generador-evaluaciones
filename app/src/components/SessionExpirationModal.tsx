"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, X } from "lucide-react";

interface SessionExpirationModalProps {
  isOpen: boolean;
  timeRemaining: number; // segundos
  onContinue: () => void;
  onExpire: () => void;
}

/**
 * Modal que avisa al usuario sobre la expiración de sesión inminente
 * Se muestra 60 segundos antes de que se expire la sesión
 */
export function SessionExpirationModal({
  isOpen,
  timeRemaining,
  onContinue,
  onExpire,
}: SessionExpirationModalProps) {
  const [displayTime, setDisplayTime] = useState(timeRemaining);

  // Actualizar tiempo mostrado cada segundo
  useEffect(() => {
    if (!isOpen) return;

    let expired = false;
    const interval = setInterval(() => {
      setDisplayTime((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          clearInterval(interval);
          expired = true;
          return 0;
        }
        return newTime;
      });
      // Llamar onExpire fuera del setState para evitar side effects
      // dentro del state setter (anti-pattern en React 18)
      if (expired) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, onExpire]);

  // Sincronizar con timeRemaining externo
  useEffect(() => {
    if (isOpen) {
      setDisplayTime(timeRemaining);
    }
  }, [isOpen, timeRemaining]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 backdrop-blur-sm z-40" onClick={onExpire} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="flex justify-between items-center sticky top-0 bg-white border-b p-6">
            <h2 className="text-xl font-semibold">Sesión por Expirar</h2>
            <button
              onClick={onExpire}
              className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
              aria-label="Cerrar modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Icon and message */}
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-yellow-100 rounded-full p-2 flex-shrink-0">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-gray-700 pt-1">
                Tu sesión expirará por inactividad en{" "}
                <span className="font-bold text-yellow-600">
                  {displayTime} segundo{displayTime !== 1 ? "s" : ""}
                </span>
                .
              </p>
            </div>

            {/* Información */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Haz clic en "Continuar" para mantener tu sesión activa y
                  evitar perder tu trabajo.
                </p>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3">
              <button
                onClick={onExpire}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cerrar Sesión
              </button>
              <button
                onClick={onContinue}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Continuar
              </button>
            </div>

            {/* Footer */}
            <p className="text-xs text-gray-500 text-center mt-4">
              Se requiere actividad para mantener la sesión activa
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
