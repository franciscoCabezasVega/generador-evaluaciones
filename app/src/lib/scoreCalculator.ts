/**
 * Calcula la nota de una tarea basada en las devoluciones
 * 
 * Reglas de penalización:
 * - Nota base: 10
 * - Cada devolución grave: -1.50 puntos
 * - Cada devolución media: -0.75 puntos
 * - Cada 5 devoluciones bajas: -0.50 puntos
 * - Nota mínima: 0
 */

export interface ScoreCalculationInput {
  lowReturns: number;
  mediumReturns: number;
  highReturns: number;
}

export function calculateTaskScore(input: ScoreCalculationInput): number {
  const BASE_SCORE = 10;
  const HIGH_RETURN_PENALTY = 1.5;
  const MEDIUM_RETURN_PENALTY = 0.75;
  const LOW_RETURN_PENALTY = 0.5;
  const LOW_RETURN_THRESHOLD = 5;

  let score = BASE_SCORE;

  // Penalizar devoluciones graves
  score -= input.highReturns * HIGH_RETURN_PENALTY;

  // Penalizar devoluciones medias
  score -= input.mediumReturns * MEDIUM_RETURN_PENALTY;

  // Penalizar devoluciones bajas (cada 5)
  const lowReturnGroups = Math.floor(input.lowReturns / LOW_RETURN_THRESHOLD);
  score -= lowReturnGroups * LOW_RETURN_PENALTY;

  // No permitir puntuación menor a 0
  return Math.max(0, Math.round(score * 100) / 100);
}

/**
 * Calcula la nota final de un equipo basada en el promedio de tareas completadas
 */
export function calculateTeamScore(taskScores: number[]): number {
  if (taskScores.length === 0) return 0;
  const sum = taskScores.reduce((acc, score) => acc + score, 0);
  return Math.round((sum / taskScores.length) * 100) / 100;
}

/**
 * Validación de devoluciones
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateReturns(value: any): boolean {
  if (value === null || value === undefined || value === '') return true;
  
  const num = Number(value);
  
  // Debe ser un número entero no negativo
  return (
    Number.isInteger(num) &&
    num >= 0 &&
    num.toString() === value.toString()
  );
}
