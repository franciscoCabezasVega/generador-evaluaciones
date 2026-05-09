import { calculateTaskScore } from "@/lib/scoreCalculator";
import { TaskSquad } from "@/lib/types";

// Tipos compartidos
export interface SquadFieldChange {
  label: string;
  old: number;
  new: number;
}

export interface SquadChange {
  squad: string;
  low: { old: number; new: number };
  medium: { old: number; new: number };
  high: { old: number; new: number };
  score: { old: number; new: number };
  additional_notes: { old: string; new: string };
}

// Normalizar número desde cualquier fuente
export const normalizeNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

// Detectar cambios en squads (compartido)
export const detectSquadChanges = (
  oldData: unknown,
  newData: unknown,
): SquadChange[] => {
  const old = Array.isArray(oldData) ? oldData : [];
  const newSqs = Array.isArray(newData) ? newData : [];

  const changes: SquadChange[] = [];
  const processedSquads = new Set<string>();

  // Procesar squads viejos
  old.forEach((oldSquad: Partial<TaskSquad>) => {
    processedSquads.add(oldSquad.squad || "");
    const newSquad = newSqs.find(
      (s: Partial<TaskSquad>) => s.squad === oldSquad.squad,
    );

    const oldLow = normalizeNumber(oldSquad.low_returns);
    const newLow = normalizeNumber(newSquad?.low_returns);
    const oldMedium = normalizeNumber(oldSquad.medium_returns);
    const newMedium = normalizeNumber(newSquad?.medium_returns);
    const oldHigh = normalizeNumber(oldSquad.high_returns);
    const newHigh = normalizeNumber(newSquad?.high_returns);
    const oldScore = calculateTaskScore({
      lowReturns: oldLow,
      mediumReturns: oldMedium,
      highReturns: oldHigh,
    });
    const newScore = calculateTaskScore({
      lowReturns: newLow,
      mediumReturns: newMedium,
      highReturns: newHigh,
    });
    const oldNotes = oldSquad.additional_notes || "";
    const newNotes = newSquad?.additional_notes || "";

    // Si algún valor cambió, registrar el cambio
    if (
      oldLow !== newLow ||
      oldMedium !== newMedium ||
      oldHigh !== newHigh ||
      oldScore !== newScore ||
      oldNotes !== newNotes
    ) {
      changes.push({
        squad: oldSquad.squad || "",
        low: { old: oldLow, new: newLow },
        medium: { old: oldMedium, new: newMedium },
        high: { old: oldHigh, new: newHigh },
        score: { old: oldScore, new: newScore },
        additional_notes: { old: oldNotes, new: newNotes },
      });
    }
  });

  // Procesar squads nuevos (no existían antes)
  newSqs.forEach((newSquad: Partial<TaskSquad>) => {
    if (!processedSquads.has(newSquad.squad || "")) {
      const newLow = normalizeNumber(newSquad.low_returns);
      const newMedium = normalizeNumber(newSquad.medium_returns);
      const newHigh = normalizeNumber(newSquad.high_returns);
      const newScore = calculateTaskScore({
        lowReturns: newLow,
        mediumReturns: newMedium,
        highReturns: newHigh,
      });
      changes.push({
        squad: newSquad.squad || "",
        low: { old: 0, new: newLow },
        medium: { old: 0, new: newMedium },
        high: { old: 0, new: newHigh },
        score: { old: 0, new: newScore },
        additional_notes: { old: "", new: newSquad.additional_notes || "" },
      });
    }
  });

  return changes;
};
