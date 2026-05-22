/**
 * workCalendarService — Calendario laboral por QA member
 *
 * Calcula las horas laborales efectivas de un QA en un mes dado,
 * descontando fines de semana, festivos (via Nager.Date) y períodos OOO.
 *
 * Usado por clickupService para aplicar el "Sabor B — Factor calendario
 * absoluto" al distribuir horas de ClickUp. El factor reduce el total
 * (no redistribuye): si el equipo trabaja 22% del calendario, solo se
 * registra ese 22% del tiempo que ClickUp contabilizó 24/7.
 *
 * Server-only: usa getServiceClient() (service role, bypasa RLS).
 */
import "server-only";

import { getServiceClient } from "@/lib/auth";
import {
  getDaysInMonth,
  getISODay,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  max as dateMax,
} from "date-fns";
import type { HolidayEntry, OOOPeriod } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface QAWorkConfig {
  id: string;
  country_code: string | null;
  work_start_time: string | null; // "HH:MM" or "HH:MM:SS"
  work_end_time: string | null;
  lunch_hours: number | null;
  work_days: number[] | null; // ISO weekdays: 1=Lun..7=Dom
}

/**
 * Value Object: ventana de tiempo en que una tarea estuvo activa en QA dentro de un mes.
 * Ambas fechas ya están clampeadas al rango [monthStart, monthEnd].
 */
export interface TaskQAWindow {
  /** Primer día del período (inclusive). */
  from: Date;
  /** Último día del período (inclusive). */
  to: Date;
}

// ── Module-level cache (vive mientras el proceso esté activo) ──────────────
// Evita re-fetch a Nager.Date dentro de la misma invocación del cron/sync.
// Clave: "CO:2026"
const _holidaysCache = new Map<string, HolidayEntry[]>();

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convierte "HH:MM" o "HH:MM:SS" a horas decimales. */
function parseTimeToHours(timeStr: string): number {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return h + m / 60;
}

/** Formatea un Date a "YYYY-MM-DD" usando la hora local (nunca toISOString). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Mapeo de country_code (ISO 3166-1 alpha-2) a IANA timezone.
 * Solo países de timezone único relevantes al equipo QA de este proyecto.
 * Países con múltiples zonas (MX, BR, US) no se incluyen por ambigüedad;
 * en esos casos se recomienda agregar un campo `timezone` explícito al QA.
 */
const COUNTRY_TIMEZONE_MAP: Readonly<Record<string, string>> = {
  CO: "America/Bogota", // UTC-5, sin DST
  EC: "America/Guayaquil", // UTC-5, sin DST
  PE: "America/Lima", // UTC-5, sin DST
  VE: "America/Caracas", // UTC-4, sin DST
  AR: "America/Argentina/Buenos_Aires", // UTC-3, sin DST
  CL: "America/Santiago", // UTC-3/-4 con DST
  UY: "America/Montevideo", // UTC-3, con DST
  BO: "America/La_Paz", // UTC-4, sin DST
  PY: "America/Asuncion", // UTC-3/-4 con DST
  ES: "Europe/Madrid", // UTC+1/+2 con DST
  GT: "America/Guatemala", // UTC-6, sin DST
  CR: "America/Costa_Rica", // UTC-6, sin DST
  SV: "America/El_Salvador", // UTC-6, sin DST
  HN: "America/Tegucigalpa", // UTC-6, sin DST
  NI: "America/Managua", // UTC-6, sin DST
  PA: "America/Panama", // UTC-5, sin DST
};

/**
 * Retorna la fracción decimal de hora (0–23.999) de un timestamp UTC
 * en el timezone local del QA, o null si el country_code no tiene mapeo.
 */
function getLocalHourDecimal(
  utcDate: Date,
  countryCode: string,
): number | null {
  const tz = COUNTRY_TIMEZONE_MAP[countryCode];
  if (!tz) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = fmt.formatToParts(utcDate);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const m = parseInt(
      parts.find((p) => p.type === "minute")?.value ?? "0",
      10,
    );
    // Intl puede devolver 24 cuando es medianoche con algunos locales → normalizar
    return (h === 24 ? 0 : h) + m / 60;
  } catch {
    return null;
  }
}

/**
 * Retorna la fecha calendario (en noon local para evitar DST) que corresponde
 * a un timestamp UTC en el timezone del QA. Retorna null sin mapeo.
 */
function getLocalCalendarDate(utcDate: Date, countryCode: string): Date | null {
  const tz = COUNTRY_TIMEZONE_MAP[countryCode];
  if (!tz) return null;
  try {
    // en-CA usa formato YYYY-MM-DD — ideal para parseo sin ambigüedad
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [year, month, day] = fmt.format(utcDate).split("-").map(Number);
    // Mediodía local evita problemas de DST al construir el Date
    return new Date(year!, month! - 1, day!, 12, 0, 0);
  } catch {
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Horas laborales por día para un QA según su configuración.
 * Retorna 8 como fallback si los campos no están configurados.
 */
export function dailyHours(qa: QAWorkConfig): number {
  const start = parseTimeToHours(qa.work_start_time ?? "09:00");
  const end = parseTimeToHours(qa.work_end_time ?? "18:00");
  const lunch = qa.lunch_hours ?? 1;
  return Math.max(0, end - start - lunch);
}

/**
 * Obtiene los festivos de un país y año.
 * 1. Busca en caché en módulo.
 * 2. Busca en tabla `holidays` de la BD.
 * 3. Si no hay datos, consulta Nager.Date y hace upsert en BD.
 * Si Nager falla, retorna [] y loggea warning — nunca bloquea el sync.
 */
export async function fetchHolidays(
  country_code: string,
  year: number,
): Promise<HolidayEntry[]> {
  const cacheKey = `${country_code}:${year}`;
  if (_holidaysCache.has(cacheKey)) {
    return _holidaysCache.get(cacheKey)!;
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.warn("[workCalendarService] Service client unavailable");
    return [];
  }

  // 1. Buscar en BD (caché persistente entre procesos)
  const { data: dbRows } = await supabase
    .from("holidays")
    .select("country_code, holiday_date, name")
    .eq("country_code", country_code)
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`);

  if (dbRows && dbRows.length > 0) {
    const result = dbRows as HolidayEntry[];
    _holidaysCache.set(cacheKey, result);
    return result;
  }

  // 2. Buscar en Nager.Date
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${country_code}`,
      { headers: { Accept: "application/json" } },
    );

    if (!res.ok) {
      console.warn(
        `[workCalendarService] Nager.Date ${res.status} for ${country_code}/${year}`,
      );
      _holidaysCache.set(cacheKey, []);
      return [];
    }

    const nagerData = (await res.json()) as {
      date: string;
      localName: string;
    }[];
    const holidays: HolidayEntry[] = nagerData.map((h) => ({
      country_code,
      holiday_date: h.date,
      name: h.localName,
      source: "nager.date",
      fetched_at: new Date().toISOString(),
    }));

    // Upsert en BD para futuras consultas
    if (holidays.length > 0) {
      await supabase.from("holidays").upsert(
        holidays.map((h) => ({
          country_code: h.country_code,
          holiday_date: h.holiday_date,
          name: h.name,
          source: h.source,
          fetched_at: h.fetched_at,
        })),
        { onConflict: "country_code,holiday_date" },
      );
    }

    _holidaysCache.set(cacheKey, holidays);
    return holidays;
  } catch (err) {
    console.warn(
      `[workCalendarService] Failed to fetch Nager.Date for ${country_code}/${year}:`,
      err,
    );
    _holidaysCache.set(cacheKey, []);
    return [];
  }
}

/**
 * Retorna true si el día es laborable para el QA:
 * - El día de la semana está en work_days del QA.
 * - No es festivo según la lista proporcionada.
 */
export function isWorkingDay(
  date: Date,
  qa: QAWorkConfig,
  holidays: HolidayEntry[],
): boolean {
  const workDays = qa.work_days ?? [1, 2, 3, 4, 5];
  const isoDay = getISODay(date); // 1=Lun, 7=Dom
  if (!workDays.includes(isoDay)) return false;

  const dateStr = toLocalDateStr(date);
  if (holidays.some((h) => h.holiday_date === dateStr)) return false;

  return true;
}

/**
 * Suma las horas laborales del QA en una ventana de tiempo dentro del mes, excluyendo OOO.
 * Retorna 0 si el QA no tiene country_code configurado (señal para fallback).
 *
 * @param qa      Configuración del QA (con id para consultar OOO en BD).
 * @param year    Año del mes a calcular.
 * @param month   Mes a calcular (1-based: 1=Enero).
 * @param window  Si se provee, delimita el rango [from, to] de días a contabilizar.
 *                Útil para tareas que entraron o salieron de QA a mitad de mes.
 */
export async function getWorkingHoursForQA(
  qa: QAWorkConfig,
  year: number,
  month: number,
  window?: TaskQAWindow,
): Promise<number> {
  if (!qa.country_code) return 0;

  const supabase = getServiceClient();
  if (!supabase) return 0;

  const holidays = await fetchHolidays(qa.country_code, year);

  const monthRef = new Date(year, month - 1);
  // La ventana delimita el rango a iterar; si no se provee, se itera el mes completo.
  const iterStart = window?.from ?? startOfMonth(monthRef);
  const iterEnd = window?.to ?? endOfMonth(monthRef);

  // Rango completo del mes (para la query de OOO, no solo desde iterStart)
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(monthRef);
  const monthEndStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Consultar períodos OOO que solapan con el mes
  const { data: oooPeriods } = await supabase
    .from("qa_member_oo")
    .select("date_from, date_to")
    .eq("qa_id", qa.id)
    .lte("date_from", monthEndStr)
    .gte("date_to", monthStartStr);

  // Construir conjunto de fechas OOO en formato "YYYY-MM-DD"
  const oooDateSet = new Set<string>();
  for (const ooo of (oooPeriods as Pick<
    OOOPeriod,
    "date_from" | "date_to"
  >[]) ?? []) {
    // Usar mediodía para evitar problemas de timezone al construir Date desde string
    const from = new Date(ooo.date_from + "T12:00:00");
    const to = new Date(ooo.date_to + "T12:00:00");
    const days = eachDayOfInterval({ start: from, end: to });
    for (const d of days) {
      oooDateSet.add(toLocalDateStr(d));
    }
  }

  // Iterar días desde iterStart (que puede ser > inicio de mes si se usa fromDate)
  const allDays = eachDayOfInterval({ start: iterStart, end: iterEnd });

  const perDay = dailyHours(qa);
  let totalHours = 0;

  for (const day of allDays) {
    const dateStr = toLocalDateStr(day);
    if (oooDateSet.has(dateStr)) continue; // día OOO
    if (!isWorkingDay(day, qa, holidays)) continue; // fin de semana o festivo
    totalHours += perDay;
  }

  // ── Ajuste por día parcial al final de la ventana ─────────────────────────
  // Si el sync ocurrió antes o durante la jornada laboral del QA (en su timezone),
  // el último día fue contado como día completo pero solo corresponde a las horas
  // efectivamente transcurridas desde el inicio de jornada.
  // Esto evita contar horas futuras (o inexistentes) cuando el sync corre antes
  // de las 8 AM hora local — caso reportado por Francisco Cabezas.
  if (window?.to && qa.country_code) {
    const localHour = getLocalHourDecimal(window.to, qa.country_code);
    if (localHour !== null) {
      const workStart = parseTimeToHours(qa.work_start_time ?? "08:00");
      const workEnd = parseTimeToHours(qa.work_end_time ?? "17:00");

      // Obtener la fecha calendario del sync en el tz del QA
      const localDate = getLocalCalendarDate(window.to, qa.country_code);
      if (localDate) {
        const localDateStr = toLocalDateStr(localDate);
        const isCounted =
          !oooDateSet.has(localDateStr) &&
          isWorkingDay(localDate, qa, holidays);

        if (isCounted) {
          if (localHour < workStart) {
            // Sync antes del inicio de jornada: el día fue contado pero 0 horas
            // han transcurrido → descontar el día completo.
            totalHours -= perDay;
          } else if (localHour < workEnd) {
            // Sync durante la jornada: solo contar las horas ya transcurridas.
            const workedToday = localHour - workStart;
            totalHours -= perDay - workedToday;
          }
          // Si localHour >= workEnd: día completo, sin ajuste.
        }
      }
    }
  }

  return totalHours;
}

/**
 * Sincroniza los festivos de un año como períodos OOO del QA (source='holiday').
 *
 * - Elimina los OOO previos con source='holiday' para ese año.
 * - Inserta cada festivo como un período de un día.
 * - Si un festivo solapa con un OOO manual (23P01), se omite silenciosamente.
 *
 * Llamado automáticamente al guardar un QA member con country_code configurado.
 */
export async function syncHolidaysAsOOO(
  qa_id: string,
  country_code: string,
  year: number,
): Promise<{ inserted: number; skipped: number }> {
  const supabase = getServiceClient();
  if (!supabase) {
    console.warn(
      "[workCalendarService] syncHolidaysAsOOO: service client unavailable",
    );
    return { inserted: 0, skipped: 0 };
  }

  const holidays = await fetchHolidays(country_code, year);
  if (holidays.length === 0) return { inserted: 0, skipped: 0 };

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Borrar los OOO generados automáticamente de años anteriores para este año
  await supabase
    .from("qa_member_oo")
    .delete()
    .eq("qa_id", qa_id)
    .eq("source", "holiday")
    .gte("date_from", yearStart)
    .lte("date_to", yearEnd);

  let inserted = 0;
  let skipped = 0;

  for (const h of holidays) {
    const { error } = await supabase.from("qa_member_oo").insert({
      qa_id,
      date_from: h.holiday_date,
      date_to: h.holiday_date,
      reason: h.name,
      source: "holiday",
    });
    if (error) {
      // 23P01 = solapamiento con OOO manual existente → ignorar
      skipped++;
      if (error.code !== "23P01") {
        console.warn(
          `[workCalendarService] syncHolidaysAsOOO: skip ${h.holiday_date}:`,
          error.message,
        );
      }
    } else {
      inserted++;
    }
  }

  console.warn(
    `[workCalendarService] syncHolidaysAsOOO: qa=${qa_id} ${country_code}/${year} → inserted=${inserted} skipped=${skipped}`,
  );
  return { inserted, skipped };
}

/**
 * Factor de ajuste calendario para un QA en la ventana en que trabajó la tarea:
 *   factor = horas_laborales_QA_en_ventana / (días_ventana × 24)
 *
 * Usar la ventana real [from, to] (en lugar del mes completo) evita subestimar
 * las horas cuando la tarea entró a QA a mitad de mes o se cerró antes del fin.
 *
 * Retorna null si el QA no tiene country_code (señal para usar split legacy).
 * Retorna 0 si el QA tiene OOO durante toda la ventana.
 *
 * Ejemplos:
 *   Mes completo  : 160 h laborales / 744 h calendario ≈ 0.215
 *   Del 15 al 31  :  88 h laborales / 408 h calendario ≈ 0.216
 *   Del 1  al 20  : 128 h laborales / 480 h calendario ≈ 0.267
 *
 * @param window  Ventana [from, to] extraída del historial de ClickUp.
 *                Si no se provee, se usa el mes completo.
 */
export async function getAdjustmentFactor(
  qa: QAWorkConfig,
  year: number,
  month: number,
  window?: TaskQAWindow,
): Promise<number | null> {
  if (!qa.country_code) return null; // fallback legacy: caller divide equitativamente

  const monthRef = new Date(year, month - 1);
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);

  // Clampear la ventana al mes: los límites nunca pueden salirse del mes asignado.
  const effectiveStart = window?.from
    ? dateMax([monthStart, window.from])
    : monthStart;
  const effectiveEnd = window?.to
    ? window.to <= monthEnd
      ? window.to
      : monthEnd
    : monthEnd;

  // Construir ventana clampada solo si difiere del mes completo
  const clampedWindow: TaskQAWindow | undefined =
    effectiveStart > monthStart || effectiveEnd < monthEnd
      ? { from: effectiveStart, to: effectiveEnd }
      : undefined;

  const workHours = await getWorkingHoursForQA(qa, year, month, clampedWindow);

  // Denominador: horas calendario exactas de la ventana efectiva (de ms a horas).
  // Se usa la diferencia real en lugar de `días × 24` para no sobreestimar
  // cuando la ventana no empieza/termina a medianoche (ej.: sync a las 6 AM).
  const totalCalendarHours =
    (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);

  // Evitar división por cero en ventanas degeneradas (from === to)
  if (totalCalendarHours <= 0) return workHours > 0 ? 1 : 0;

  return workHours / totalCalendarHours;
}
