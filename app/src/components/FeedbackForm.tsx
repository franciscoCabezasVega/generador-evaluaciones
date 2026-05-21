"use client";

import { useState } from "react";
import { FeedbackType } from "@/lib/types";
import { useFeedback } from "@/hooks/useFeedback";
import { useTour } from "@/contexts/TourContext";
import {
  X,
  AlertCircle,
  Lightbulb,
  Check,
  Link as LinkIcon,
  HelpCircle,
} from "lucide-react";

interface FeedbackFormProps {
  onClose: () => void;
  onSubmitSuccess: () => void;
}

export function FeedbackForm({ onClose, onSubmitSuccess }: FeedbackFormProps) {
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [successMessage, setSuccessMessage] = useState(false);
  const { startTour } = useTour();

  const { isLoading, error, submitFeedback, clearError } = useFeedback({
    onSuccess: () => {
      setSuccessMessage(true);
      setTimeout(() => {
        setSuccessMessage(false);
        // Reset form
        setType("suggestion");
        setDescription("");
        setEvidenceUrl("");
        onSubmitSuccess();
      }, 2000);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const evidence = evidenceUrl
      ? [{ type: "link" as const, value: evidenceUrl }]
      : undefined;
    await submitFeedback(type, description, evidence);
  };

  if (successMessage) {
    return (
      <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="bg-green-100 p-3 rounded-full">
            <Check className="text-green-600 w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            ¡Reporte enviado!
          </h3>
          <p className="text-sm text-gray-600">
            Gracias por tu retroalimentación
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          Reportar un problema
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar formulario"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de reporte
          </label>
          <div className="flex gap-3">
            {[
              {
                value: "suggestion" as FeedbackType,
                label: "Sugerencia",
                icon: Lightbulb,
              },
              {
                value: "incident" as FeedbackType,
                label: "Incidencia",
                icon: AlertCircle,
              },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  clearError();
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${
                  type === value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Descripción <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError();
            }}
            placeholder="Describe el problema, sugerencia o mejora que deseas reportar..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Mínimo {description.length}/10 caracteres
          </p>
        </div>

        {/* Evidence Section */}
        <div>
          <label
            htmlFor="evidenceUrl"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Enlace de Jam <span className="text-gray-500">(Opcional)</span>
          </label>
          <div className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-gray-400" />
            <input
              id="evidenceUrl"
              type="url"
              placeholder="ej: https://jam.dev/c/uuid"
              value={evidenceUrl}
              onChange={(e) => {
                setEvidenceUrl(e.target.value);
                clearError();
              }}
              disabled={isLoading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Pega un enlace válido de jam.dev para adjuntar evidencia
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Help with Tour */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <button
            type="button"
            onClick={() => {
              onClose();
              startTour("tasks");
            }}
            className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 font-medium transition-colors w-full justify-center"
          >
            <HelpCircle className="w-4 h-4" />
            ¿Necesitas ayuda? Inicia una visita guiada
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? "Enviando..." : "Enviar reporte"}
          </button>
        </div>
      </form>
    </div>
  );
}
