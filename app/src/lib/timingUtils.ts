/**
 * Utilidades para formatear tiempos
 * Convierte horas a un formato legible: meses, días, horas
 */

const WORK_HOURS_PER_DAY = 8;
const WORK_DAYS_PER_MONTH = 22; // Días laborales promedio

/**
 * Formatea horas a un string legible
 * Ejemplo: 176 horas -> "1m 1d" (1 mes laborales = 176 horas)
 * @param hours Número de horas
 * @returns String formateado
 */
export function formatTime(hours: number): string {
  if (hours === 0) return "0h";

  let result = "";
  let remaining = hours;

  // Meses
  const monthsHours = WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY;
  const months = Math.floor(remaining / monthsHours);
  if (months > 0) {
    result += `${months}m `;
    remaining -= months * monthsHours;
  }

  // Días
  const days = Math.floor(remaining / WORK_HOURS_PER_DAY);
  if (days > 0) {
    result += `${days}d `;
    remaining -= days * WORK_HOURS_PER_DAY;
  }

  // Horas
  const remainingHours = Math.round(remaining * 100) / 100;
  if (remainingHours > 0) {
    result += `${remainingHours}h`;
  }

  return result.trim();
}

/**
 * Convertir horas a días laborales
 * @param hours Número de horas
 * @returns Número de días laborales
 */
export function hoursToDays(hours: number): number {
  return hours / WORK_HOURS_PER_DAY;
}

/**
 * Convertir días laborales a horas
 * @param days Número de días
 * @returns Número de horas
 */
export function daysToHours(days: number): number {
  return days * WORK_HOURS_PER_DAY;
}

/**
 * Convertir horas a meses laborales
 * @param hours Número de horas
 * @returns Número de meses laborales
 */
export function hoursToMonths(hours: number): number {
  return hours / (WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY);
}

/**
 * Convertir meses laborales a horas
 * @param months Número de meses
 * @returns Número de horas
 */
export function monthsToHours(months: number): number {
  return months * WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY;
}

/**
 * Obtener detalles de un tiempo en horas
 * @param hours Número de horas
 * @returns Objeto con meses, días y horas desagregados
 */
export function getTimeDetails(hours: number) {
  let remaining = hours;

  const monthsHours = WORK_DAYS_PER_MONTH * WORK_HOURS_PER_DAY;
  const months = Math.floor(remaining / monthsHours);
  remaining -= months * monthsHours;

  const days = Math.floor(remaining / WORK_HOURS_PER_DAY);
  remaining -= days * WORK_HOURS_PER_DAY;

  const remainingHours = Math.round(remaining * 100) / 100;

  return {
    months,
    days,
    hours: remainingHours,
    total: hours,
  };
}

/**
 * Calcular duración total de las fases
 * @param timings Array de timings
 * @returns Total de horas
 */
export function calculateTotalHours(
  timings: Array<{
    effective_testing_hours?: number;
    waiting_environment_hours?: number;
    waiting_development_fixes_hours?: number;
    retest_hours?: number;
    clarification_hours?: number;
  }>,
): number {
  return timings.reduce(
    (total, timing) =>
      total +
      (timing.effective_testing_hours || 0) +
      (timing.waiting_environment_hours || 0) +
      (timing.waiting_development_fixes_hours || 0) +
      (timing.retest_hours || 0) +
      (timing.clarification_hours || 0),
    0,
  );
}

/**
 * Calcular promedio de horas por fase
 * @param timings Array de timings
 * @returns Objeto con promedios por fase
 */
export function calculateAveragesByPhase(
  timings: Array<{
    effective_testing_hours?: number;
    waiting_environment_hours?: number;
    waiting_development_fixes_hours?: number;
    retest_hours?: number;
    clarification_hours?: number;
  }>,
) {
  if (timings.length === 0) {
    return {
      avg_effective_testing: 0,
      avg_waiting_environment: 0,
      avg_waiting_development_fixes: 0,
      avg_retest: 0,
      avg_clarification: 0,
      avg_total: 0,
    };
  }

  const totalEffectiveTesting = timings.reduce(
    (sum, t) => sum + (t.effective_testing_hours || 0),
    0,
  );
  const totalWaitingEnvironment = timings.reduce(
    (sum, t) => sum + (t.waiting_environment_hours || 0),
    0,
  );
  const totalWaitingDevelopmentFixes = timings.reduce(
    (sum, t) => sum + (t.waiting_development_fixes_hours || 0),
    0,
  );
  const totalRetest = timings.reduce(
    (sum, t) => sum + (t.retest_hours || 0),
    0,
  );
  const totalClarification = timings.reduce(
    (sum, t) => sum + (t.clarification_hours || 0),
    0,
  );

  const count = timings.length;

  return {
    avg_effective_testing:
      Math.round((totalEffectiveTesting / count) * 100) / 100,
    avg_waiting_environment:
      Math.round((totalWaitingEnvironment / count) * 100) / 100,
    avg_waiting_development_fixes:
      Math.round((totalWaitingDevelopmentFixes / count) * 100) / 100,
    avg_retest: Math.round((totalRetest / count) * 100) / 100,
    avg_clarification: Math.round((totalClarification / count) * 100) / 100,
    avg_total:
      Math.round(
        ((totalEffectiveTesting +
          totalWaitingEnvironment +
          totalWaitingDevelopmentFixes +
          totalRetest +
          totalClarification) /
          count) *
          100,
      ) / 100,
  };
}
