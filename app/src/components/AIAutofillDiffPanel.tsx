"use client";

import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AISuggestions } from "@/lib/types";

interface FormDataState {
  name: string;
  task_link: string;
  product_type: string;
  squads: Array<{
    squad: string;
    low_returns: number;
    medium_returns: number;
    high_returns: number;
    additional_notes?: string;
  }>;
  assigned_qa: string[];
  status: "Completada" | "Deprecada" | "Pendiente";
  month: number;
  year: number;
  effort_score_date: string;
  tshirt_size: string;
  project_type: string;
}

interface AIAutofillDiffPanelProps {
  current: FormDataState;
  suggestions: AISuggestions;
  onApply: (selected: Partial<FormDataState>) => void;
  onCancel: () => void;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "month" && typeof value === "number")
    return MONTH_NAMES[value - 1] ?? String(value);
  if (key === "squads" && Array.isArray(value))
    return value.map((s: { squad: string }) => s.squad).join(", ") || "—";
  if (key === "assigned_qa" && Array.isArray(value))
    return (value as string[]).join(", ") || "—";
  return String(value);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

type DiffKey = keyof AISuggestions;

const FIELD_LABELS: Record<DiffKey, string> = {
  name: "Nombre",
  product_type: "Producto",
  project_type: "Tipo Proyecto",
  tshirt_size: "Complejidad",
  status: "Estado",
  month: "Mes",
  year: "Año",
  effort_score_date: "Fecha de Esfuerzo",
  squads: "Squads",
  assigned_qa: "QA Asignados",
};

function isSameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b))
    return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

export function AIAutofillDiffPanel({
  current,
  suggestions,
  onApply,
  onCancel,
}: AIAutofillDiffPanelProps) {
  // Solo mostrar campos donde la sugerencia es distinta al valor actual
  const diffKeys = (Object.keys(suggestions) as DiffKey[]).filter(
    (key) =>
      suggestions[key] !== null &&
      suggestions[key] !== undefined &&
      !isSameValue(suggestions[key], current[key as keyof FormDataState]),
  );

  // Por defecto, activar toggle si el campo está vacío/en valor inicial
  const initialToggles = Object.fromEntries(
    diffKeys.map((key) => [
      key,
      isEmptyValue(current[key as keyof FormDataState]),
    ]),
  ) as Record<DiffKey, boolean>;

  const [toggles, setToggles] = useState<Record<DiffKey, boolean>>(
    initialToggles as Record<DiffKey, boolean>,
  );

  const handleToggle = (key: DiffKey) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = () => {
    const selected: Partial<FormDataState> = {};
    for (const key of diffKeys) {
      if (toggles[key] && suggestions[key] !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (selected as Record<string, unknown>)[key] = suggestions[key] as any;
      }
    }
    onApply(selected);
  };

  const activeCount = Object.values(toggles).filter(Boolean).length;

  if (diffKeys.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-400/30 bg-yellow-950/20 p-4 text-sm text-yellow-200">
        <p className="font-medium mb-1">Sin sugerencias</p>
        <p className="text-yellow-300/70">
          La IA no pudo inferir campos con suficiente confianza para esta tarea.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onCancel}
        >
          Cerrar
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-blue-400" />
        <p className="text-sm font-semibold text-blue-300">
          Sugerencias de IA — selecciona los campos a aplicar
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-2 pr-3 font-medium text-gray-400">Campo</th>
              <th className="pb-2 pr-3 font-medium text-gray-400">
                Valor actual
              </th>
              <th className="pb-2 pr-3 font-medium text-blue-400">
                Sugerencia IA
              </th>
              <th className="pb-2 font-medium text-gray-400 text-center">
                Aplicar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {diffKeys.map((key) => (
              <tr key={key} className="text-sm">
                <td className="py-2 pr-3 text-gray-300 font-medium">
                  {FIELD_LABELS[key] ?? key}
                </td>
                <td className="py-2 pr-3 text-gray-400">
                  {formatValue(key, current[key as keyof FormDataState])}
                </td>
                <td
                  className={`py-2 pr-3 font-medium ${toggles[key] ? "text-blue-300" : "text-gray-300"}`}
                >
                  {formatValue(key, suggestions[key])}
                </td>
                <td className="py-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(key)}
                    className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${
                      toggles[key]
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-gray-500"
                    }`}
                    aria-label={`${toggles[key] ? "Desactivar" : "Activar"} sugerencia para ${FIELD_LABELS[key] ?? key}`}
                  >
                    {toggles[key] && <Check size={12} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <p className="text-xs text-gray-400">
          {activeCount} campo{activeCount !== 1 ? "s" : ""} seleccionado
          {activeCount !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="gap-1"
          >
            <X size={12} />
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={activeCount === 0}
            className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check size={12} />
            Aplicar selección
          </Button>
        </div>
      </div>
    </div>
  );
}
