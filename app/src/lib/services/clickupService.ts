/**
 * ClickUp Integration Service
 *
 * Responsible for:
 *  - Fetching "Time in Status" data from the ClickUp API
 *  - Mapping ClickUp statuses to internal timing categories
 *  - Upserting TaskTiming records from ClickUp data
 *
 * All DB access uses the service-role Supabase client (bypasses RLS).
 * ClickUp API key is stored encrypted and decrypted at runtime.
 */
import "server-only";

import { getServiceClient } from "@/lib/auth";
import { decryptText } from "@/lib/encryption";
import { endOfMonth } from "date-fns";
import {
  getAdjustmentFactor,
  type TaskQAWindow,
} from "@/lib/services/workCalendarService";

// ── Types ──────────────────────────────────────────────────────────────────

interface ClickUpTimeInStatus {
  status: string;
  /** Total time in this status; `by_minute` is in minutes (not milliseconds). */
  total_time: {
    by_minute: number;
    since: string;
  };
  orderindex: number;
}

interface ClickUpTimeInStatusResponse {
  status_history: ClickUpTimeInStatus[];
  /** Estado actual de la tarea (presente en la mayoría de respuestas). */
  current_status?: ClickUpTimeInStatus;
}

/** Maps a timing_categories slug to total hours computed from ClickUp. */
type CategoryHours = Record<string, number>;

// ── Constants ──────────────────────────────────────────────────────────────

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

/**
 * Maps ClickUp status names (lowercase) to timing_categories slugs.
 * Only QA-prefixed statuses are mapped — these match the actual workflow
 * statuses used in ClickUp QA boards.
 */
const STATUS_CATEGORY_MAP: Record<string, string> = {
  // ── Tareas con prefijo "QA - " ─────────────────────────────────────────────
  "qa - testing": "effective_testing",
  "qa - ready for testing": "qa_ready_for_testing",
  "qa - retesting": "qa_retesting",
  "qa - on hold": "qa_on_hold",
  "qa - fixed": "qa_fixed",
  "qa - sin asignar": "qa_sin_asignar",
  "qa - review client": "qa_review_client",
  "qa - returned to dev": "waiting_development_fixes",
  "qa - clarification": "clarification",
  "qa - clarificaciones": "clarification",
  "qa - waiting environment": "waiting_environment",
  "qa - en espera de ambiente": "waiting_environment",

  // ── Tareas sin prefijo (statuses bare) ────────────────────────────────────
  "in testing": "effective_testing",
  retesting: "qa_retesting",
  "on hold": "qa_on_hold",
  fixed: "qa_fixed",
  "review client": "qa_review_client",
  clarificaciones: "clarification",
  "en espera de ambiente": "waiting_environment",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Retrieve and decrypt the stored ClickUp API key. Returns null if not set. */
export async function getClickUpApiKey(): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  // maybeSingle() returns { data: null, error: null } for 0 rows (not configured),
  // { data: row } for exactly 1 row, and { error } for multiple rows
  // (broken singleton constraint — fail explicitly instead of silently returning null).
  const { data, error } = await supabase
    .from("clickup_settings")
    .select("encrypted_key, key_iv")
    .maybeSingle();

  if (error) {
    throw new Error(`Error de BD al leer clickup_settings: ${error.message}`);
  }
  if (!data) return null;

  try {
    return await decryptText(data.encrypted_key, data.key_iv);
  } catch (err) {
    // Distinguish decryption failure from "not configured" so callers can
    // surface a meaningful diagnostic instead of a generic "not configured".
    throw new Error(
      `Error al descifrar la API key de ClickUp — el texto cifrado puede estar corrupto o CLICKUP_ENCRYPTION_KEY ha cambiado. Error original: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

// Re-export para que el código servidor pueda usarlo sin importar el módulo cliente
export { isClickUpUrl } from "@/lib/utils/clickupUtils";

/**
 * Extract just the ClickUp task ID from a full ClickUp URL or return the
 * value as-is if it already looks like a bare task ID.
 *
 * ClickUp task URLs look like:
 *   https://app.clickup.com/t/abc123def
 *   https://app.clickup.com/12345678/t/abc123def
 */
export function extractClickUpTaskId(input: string): string {
  const trimmed = input.trim(); // trim once, applies to both URL and bare-ID paths
  // If it contains a slash, try to parse as URL
  if (trimmed.includes("/")) {
    const match = trimmed.match(/\/t\/([a-zA-Z0-9]+)/);
    if (match) return match[1];
    // Fallback: last path segment — strip query string and fragment so that
    // URLs like `.../abc123?foo=bar#section` don't return a contaminated ID.
    const parts = trimmed.split("/").filter(Boolean);
    const lastSegment = (parts[parts.length - 1] ?? trimmed)
      .split("?")[0]
      .split("#")[0];
    return lastSegment;
  }
  return trimmed;
}

/**
 * Fetch "Time in Status" for a single ClickUp task.
 * Throws on network / API errors.
 */
async function fetchTimeInStatus(
  taskId: string,
  apiKey: string,
): Promise<ClickUpTimeInStatusResponse> {
  const url = `${CLICKUP_API_BASE}/task/${taskId}/time_in_status`;
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
    // 45s: da margen suficiente antes del timeout de 60s del cliente
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Error de la API de ClickUp ${response.status} para la tarea ${taskId}: ${body}`,
    );
  }

  return response.json() as Promise<ClickUpTimeInStatusResponse>;
}

/**
 * Map a list of ClickUp time-in-status entries to category hours.
 * Returns a map of timing_categories slug → decimal hours.
 * Statuses not recognised are silently ignored.
 */
function mapStatusesToCategoryHours(
  history: ClickUpTimeInStatus[],
): CategoryHours {
  const result: CategoryHours = {};
  for (const entry of history) {
    const slug = STATUS_CATEGORY_MAP[entry.status.toLowerCase()];
    if (slug) {
      // ClickUp by_minute is calendar time (24 h/day). Convert to work-hours
      // using an 8 h/day factor (÷60 min→h, ÷3 to go from 24 h→8 h day).
      result[slug] = (result[slug] ?? 0) + entry.total_time.by_minute / 180;
    }
  }
  return result;
}

/**
 * Whether a ClickUp status indicates the task is finished and no further
 * sync is needed.
 */
export function isTerminalStatus(status: string): boolean {
  const terminal = ["closed", "done", "complete", "completed", "cancelled"];
  return terminal.includes(status.toLowerCase());
}

/**
 * Factory (Value Object pattern) — construye la ventana [from, to] del período
 * en que la tarea estuvo activa en cualquier status QA reconocido.
 *
 * - from: timestamp más temprano entre todos los statuses QA del historial.
 *         Si la tarea entró a QA antes del mes asignado, se clampea al inicio de mes.
 * - to:   si la última transición es a un estado terminal (closed/done/…),
 *         se usa el `since` de ese estado como fecha de cierre;
 *         si la tarea sigue abierta, se usa la fecha de hoy.
 *         Siempre clampeado al fin del mes asignado.
 *
 * Retorna undefined si no hay ningún status QA en el historial.
 */
function _extractTaskQAWindow(
  statusHistory: ClickUpTimeInStatus[],
  taskMeta: { year: number; month: number },
  // Estado actual reportado por ClickUp — más fiable que orderindex (que es
  // la posición de la columna en el workflow, no el orden cronológico).
  currentStatus?: ClickUpTimeInStatus,
): TaskQAWindow | undefined {
  const monthStart = new Date(taskMeta.year, taskMeta.month - 1, 1);
  const monthEnd = endOfMonth(monthStart);

  // ── from: entrada más temprana a QA ─────────────────────────────────────
  const qaEntries = statusHistory.filter(
    (e) => STATUS_CATEGORY_MAP[e.status.toLowerCase()],
  );
  if (qaEntries.length === 0) return undefined;

  const sinceMsValues = qaEntries
    .map((e) => Number(e.total_time.since))
    .filter((n) => !isNaN(n) && n > 0);
  if (sinceMsValues.length === 0) return undefined;

  const fromRaw = new Date(Math.min(...sinceMsValues));
  // Clamp from: si entró a QA antes del mes asignado, usar inicio de mes;
  // si la fecha raw cae después del mes (edge case improbable), usar mes completo.
  const from =
    fromRaw > monthEnd
      ? monthStart
      : fromRaw < monthStart
        ? monthStart
        : fromRaw;

  // ── to: fin del período QA ────────────────────────────────────────────────
  // 1. Último entry QA por timestamp (no por orderindex).
  const lastQAEntry = qaEntries.reduce(
    (prev, curr) =>
      Number(curr.total_time.since) > Number(prev.total_time.since)
        ? curr
        : prev,
    qaEntries[0]!,
  );
  const lastQASinceMs = Number(lastQAEntry.total_time.since);

  // 2. ¿La tarea salió de QA? — primer status no-QA posterior al último QA.
  // Si existe, la ventana termina cuando la tarea transitó fuera de QA, no hoy.
  const nonQAAfterLastQA = statusHistory.filter(
    (e) =>
      !STATUS_CATEGORY_MAP[e.status.toLowerCase()] &&
      Number(e.total_time.since) > lastQASinceMs,
  );

  let toRaw: Date;
  if (nonQAAfterLastQA.length > 0) {
    // La tarea salió de QA → `to` es el momento de la primera transición fuera de QA.
    const exitMs = Math.min(
      ...nonQAAfterLastQA.map((e) => Number(e.total_time.since)),
    );
    toRaw = new Date(exitMs);
  } else {
    // La tarea sigue en QA (o es terminal): usar currentStatus o historial global.
    const latestEntry =
      currentStatus ??
      statusHistory.reduce(
        (prev, curr) =>
          Number(curr.total_time.since) > Number(prev.total_time.since)
            ? curr
            : prev,
        statusHistory[0],
      );
    if (latestEntry && isTerminalStatus(latestEntry.status)) {
      // Tarea cerrada: usamos el since del status terminal como fecha de cierre.
      const doneSince = Number(latestEntry.total_time.since);
      toRaw =
        !isNaN(doneSince) && doneSince > 0 ? new Date(doneSince) : new Date();
    } else {
      // En progreso (aún en QA): hasta ahora.
      toRaw = new Date();
    }
  }

  // Clamp to: no puede superar el fin del mes ni ser anterior a from.
  const to = toRaw > monthEnd ? monthEnd : toRaw < from ? from : toRaw;

  return { from, to };
}

// ── Main export ────────────────────────────────────────────────────────────

export interface SyncResult {
  taskId: string;
  clickupTaskId: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
  /**
   * Solo presente cuando se invoca con previewOnly=true.
   * Contiene las horas computadas desde ClickUp sin que se hayan escrito en BD.
   * hours_by_category usa category_id (UUID) — misma clave que usa el form.
   */
  preview_qa_entries?: Array<{
    qa_name: string;
    hours_by_category: Record<string, number>;
  }>;
}

/**
 * Sync timing data from ClickUp for a single internal task.
 *
 * Steps:
 * 1. Get API key (decrypt from DB)
 * 2. Fetch time-in-status from ClickUp
 * 3. Map statuses to timing categories
 * 4. Upsert TaskTiming record
 * 5. Update clickup_task_sync.last_synced_at and last_clickup_status
 */
export async function syncTaskTimings(
  internalTaskId: string,
  clickupQaTaskId: string,
  userCtx?: { userId: string; userEmail: string },
  options?: { previewOnly?: boolean },
): Promise<SyncResult> {
  const supabase = getServiceClient();
  if (!supabase) {
    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: false,
      error: "Service client unavailable",
    };
  }

  // Step 1: Get API key
  let apiKey: string | null;
  try {
    apiKey = await getClickUpApiKey();
  } catch (err) {
    // Thrown only when a key IS stored but decryption fails (key rotation, env mismatch).
    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "ClickUp API key decryption failed",
    };
  }
  if (!apiKey) {
    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: false,
      error: "ClickUp API key not configured",
    };
  }

  const taskId = extractClickUpTaskId(clickupQaTaskId);

  try {
    // Step 2: Fetch from ClickUp
    const timeData = await fetchTimeInStatus(taskId, apiKey);

    // Step 3: Mapear status_history a horas por categoría.
    // Se usa status_history.by_minute directamente (tiempo acumulado total por status).
    // current_status no se procesa por separado para evitar doble conteo cuando
    // status_history.by_minute y current_status.by_minute representan la misma sesión.
    const categoryHours = mapStatusesToCategoryHours(
      timeData.status_history ?? [],
    );

    // Determine the latest status (highest orderindex = most recent)
    const latestStatus =
      timeData.status_history?.reduce(
        (prev, curr) => (curr.orderindex > prev.orderindex ? curr : prev),
        timeData.status_history[0],
      )?.status ?? null;

    // Step 4: Write hours into the correct schema hierarchy:
    //   task_timings → timing_qa_entries → timing_qa_category_hours
    const slugs = Object.keys(categoryHours);
    if (slugs.length > 0) {
      // 4a. Find the timing row for this task's evaluation month/year.
      //     ClickUp time_in_status is cumulative (not per-month), so we must
      //     write to exactly one row. We use the task's own month/year rather
      //     than "most recently created" to avoid writing to the wrong row
      //     when a user backfills timings out of chronological order.
      //     (oldest matching row preferred: preserves the original over backfill)
      const { data: taskMeta, error: taskMetaError } = await supabase
        .from("tasks")
        .select("month, year")
        .eq("id", internalTaskId)
        .maybeSingle();

      if (taskMetaError) {
        throw new Error(
          `Error de BD al leer la tarea: ${taskMetaError.message}`,
        );
      }

      let latestTiming: { id: string } | null = null;
      if (taskMeta) {
        const { data: tData, error: tError } = await supabase
          .from("task_timings")
          .select("id")
          .eq("task_id", internalTaskId)
          .eq("month", taskMeta.month)
          .eq("year", taskMeta.year)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (tError) {
          throw new Error(
            `Error de BD al leer task_timings: ${tError.message}`,
          );
        }
        latestTiming = tData;
      }

      if (latestTiming) {
        // 4b. Find all QA entries for this (single) timing row only.
        //     qa_name lives in the task_qa table (FK: task_qa_id) — not a
        //     direct column of timing_qa_entries. Use the nested join syntax
        //     that timingService uses (task_qa!inner(qa_name)).
        const { data: qaEntries, error: qaError } = await supabase
          .from("timing_qa_entries")
          .select("id, task_qa_id, task_qa!inner(qa_name)")
          .eq("timing_id", latestTiming.id);

        if (qaError) {
          throw new Error(
            `Error de BD al leer timing_qa_entries: ${qaError.message}`,
          );
        }

        if (qaEntries && qaEntries.length > 0) {
          // 4c. Resolve category IDs by slug (also capture name for audit display).
          const { data: categories, error: catError } = await supabase
            .from("timing_categories")
            .select("id, slug, name")
            .in("slug", slugs);

          if (catError) {
            throw new Error(
              `Error de BD al leer timing_categories: ${catError.message}`,
            );
          }

          const categoryMap = new Map<string, string>(
            (categories ?? []).map((c) => [c.slug as string, c.id as string]),
          );
          const categoryIdToName = new Map<string, string>(
            (categories ?? []).map((c) => [c.id as string, c.name as string]),
          );

          // 4d. Divide hours equally among all QA entries so no member gets
          //     the full total when multiple QAs share the task.
          //     We first capture OLD state, then DELETE existing rows so
          //     the sync always reflects the latest ClickUp data.
          const qaCount = qaEntries.length;
          const entryIds = qaEntries.map((e) => e.id as string);
          const categoryIds = Array.from(categoryMap.values());

          // ── Sabor B: Factor calendario absoluto ──────────────────
          // Si ENABLE_WORK_CALENDAR_ADJUSTMENT=true, ajustamos las horas de
          // cada QA proporcionalmente a sus horas laborales reales dentro de
          // la ventana en que la tarea estuvo en QA, en lugar de dividir
          // equitativamente. El factor es (ver getAdjustmentFactor):
          //   factor = workHours_QA_en_ventana / horas_calendario_de_ventana
          // donde horas_calendario_de_ventana = (window.to - window.from) en ms / 3600000.
          // Esto reduce el total registrado (no redistribuye entre QAs),
          // reflejando solo las horas que el QA estuvo efectivamente activo.
          // Si el QA no tiene country_code configurado, fallback al split legacy.
          // by design: el feature flag permite rollback instantáneo si hay regresiones.

          // Helper: extract qa_name from the nested task_qa join result
          // (same pattern as flattenQAEntries in timingService.ts)
          const extractQaName = (qe: Record<string, unknown>): string => {
            const raw = qe["task_qa"];
            return (
              (Array.isArray(raw)
                ? (raw[0] as { qa_name?: string })?.qa_name
                : (raw as { qa_name?: string } | undefined)?.qa_name) ?? ""
            );
          };

          // ── Sabor B: Factor calendario absoluto (mes completo) ────────────────
          // factor = workHours_QA_en_mes / horas_calendario_del_mes
          // Se aplica sobre el tiempo acumulado de status_history para estimar
          // las horas efectivas de trabajo, descontando fines de semana, festivos y OOO.
          // QAs sin country_code → comportamiento legacy (rawHours sin ajuste).
          // by design: el feature flag permite rollback instantáneo si hay regresiones.
          let frozenFactorByEntryId: Map<string, number> | null = null;
          if (process.env.ENABLE_WORK_CALENDAR_ADJUSTMENT === "true") {
            const qaNames = qaEntries.map((e) =>
              extractQaName(e as Record<string, unknown>),
            );
            const uniqueNames = [...new Set(qaNames.filter(Boolean))];

            // Buscar config de calendario en qa_members (join por nombre)
            const { data: qaConfigs } = await supabase
              .from("qa_members")
              .select(
                "id, name, country_code, timezone, work_start_time, work_end_time, lunch_hours, work_days",
              )
              .in("name", uniqueNames);

            if (qaConfigs && qaConfigs.length > 0) {
              const year = (taskMeta as { year: number })?.year ?? 0;
              const month = (taskMeta as { month: number })?.month ?? 0;

              if (year > 0 && month > 0) {
                const frozenFactorByName = new Map<string, number>();

                await Promise.all(
                  qaConfigs.map((qc) => {
                    const qaConfig = {
                      id: qc.id as string,
                      country_code: qc.country_code as string | null,
                      timezone: qc.timezone as string | null,
                      work_start_time: qc.work_start_time as string | null,
                      work_end_time: qc.work_end_time as string | null,
                      lunch_hours: qc.lunch_hours as number | null,
                      work_days: qc.work_days as number[] | null,
                    };
                    return getAdjustmentFactor(qaConfig, year, month).then(
                      (f) => {
                        if (f !== null)
                          frozenFactorByName.set(qc.name as string, f);
                      },
                    );
                  }),
                );

                const buildFactorMap = (
                  factorByName: Map<string, number>,
                ): Map<string, number> | null => {
                  if (factorByName.size === 0) return null;
                  return new Map(
                    qaEntries
                      .filter((e) =>
                        factorByName.has(
                          extractQaName(e as Record<string, unknown>),
                        ),
                      )
                      .map((e) => {
                        const name = extractQaName(
                          e as Record<string, unknown>,
                        );
                        return [e.id as string, factorByName.get(name)!];
                      }),
                  );
                };

                frozenFactorByEntryId = buildFactorMap(frozenFactorByName);
              }
            }
          }

          // Compute desired new state first (before reading or modifying DB).
          // raw_hours/factor son opcionales: solo presentes cuando se aplicó
          // el ajuste calendario (ENABLE_WORK_CALENDAR_ADJUSTMENT=true y QA con config).
          type AuditQAEntry = {
            qa_name: string;
            categories: {
              category_name: string;
              hours: number;
              raw_hours?: number;
              factor?: number;
            }[];
          };

          // rawHours = by_minute / 180 = calendarHours / 3 (estimación 8h/24h por día).
          // Fórmula correcta: calendarHours × calFactor = (rawHours × 3) × calFactor = workHours.
          // Sin calFactor (legacy): rawHours (estimación rough que incluye fines de semana).
          const rows = qaEntries.flatMap((entry) =>
            Object.keys(categoryHours)
              .filter((slug) => categoryMap.has(slug))
              .map((slug) => {
                const rawHours = (categoryHours[slug] ?? 0) / qaCount;
                const calFactor = frozenFactorByEntryId?.get(
                  entry.id as string,
                );
                const effectiveHours =
                  calFactor !== undefined ? rawHours * 3 * calFactor : rawHours;
                return {
                  timing_qa_entry_id: entry.id as string,
                  category_id: categoryMap.get(slug)!,
                  hours: Math.round(effectiveHours * 100) / 100,
                };
              }),
          );

          // Build new QA entries for audit + diff (mirrors rows being inserted)
          const newQAEntries: AuditQAEntry[] = (
            qaEntries as Record<string, unknown>[]
          ).map((qe) => ({
            qa_name: extractQaName(qe),
            categories: Object.keys(categoryHours)
              .filter((slug) => categoryMap.has(slug))
              .map((slug) => {
                const rawHours = (categoryHours[slug] ?? 0) / qaCount;
                const calFactor = frozenFactorByEntryId?.get(qe.id as string);
                const effectiveHours =
                  calFactor !== undefined ? rawHours * 3 * calFactor : rawHours;
                return {
                  category_name:
                    (categories ?? []).find((c) => c.slug === slug)?.name ??
                    slug,
                  hours: Math.round(effectiveHours * 100) / 100,
                  ...(calFactor !== undefined
                    ? {
                        raw_hours: Math.round(rawHours * 100) / 100,
                        factor: Math.round(calFactor * 10000) / 10000,
                      }
                    : {}),
                };
              })
              .filter((c) => c.hours > 0),
          }));

          // previewOnly: retornar horas computadas sin escribir en BD.
          // hours_by_category usa category_id (UUID) — misma clave que usa el form
          // (entry.hours_by_category[cat.id] donde cat.id es UUID).
          // El upsert de clickup_task_sync ya fue hecho en la ruta antes de llegar aquí.
          if (options?.previewOnly) {
            const previewQaEntries = (
              qaEntries as Record<string, unknown>[]
            ).map((qe) => {
              const entryId = qe.id as string;
              const qa_name = extractQaName(qe);
              const hours_by_category: Record<string, number> = {};
              rows
                .filter((r) => r.timing_qa_entry_id === entryId && r.hours > 0)
                .forEach((r) => {
                  hours_by_category[r.category_id] = r.hours;
                });
              return { qa_name, hours_by_category };
            });
            return {
              taskId: internalTaskId,
              clickupTaskId: clickupQaTaskId,
              success: true,
              preview_qa_entries: previewQaEntries,
            };
          }

          // Capture current (old) state from DB for diff comparison + audit
          let oldQAEntries: AuditQAEntry[] = [];
          if (categoryIds.length > 0) {
            const { data: currentHours } = await supabase
              .from("timing_qa_category_hours")
              .select("timing_qa_entry_id, category_id, hours")
              .in("timing_qa_entry_id", entryIds)
              .in("category_id", categoryIds);

            oldQAEntries = (qaEntries as Record<string, unknown>[])
              .map((qe) => {
                const cats = (currentHours ?? [])
                  .filter(
                    (h) =>
                      h.timing_qa_entry_id === (qe.id as string) &&
                      (h.hours as number) > 0,
                  )
                  .map((h) => ({
                    category_name:
                      categoryIdToName.get(h.category_id as string) ??
                      (h.category_id as string),
                    hours: h.hours as number,
                  }));
                return { qa_name: extractQaName(qe), categories: cats };
              })
              .filter((e) => e.categories.length > 0);
          }

          // Normalize entries for stable deep comparison (ignores extra fields like raw_hours/factor)
          const normalizeEntries = (
            entries: {
              qa_name: string;
              categories: { category_name: string; hours: number }[];
            }[],
          ) =>
            JSON.stringify(
              entries
                .map((e) => ({
                  qa_name: e.qa_name,
                  categories: [...e.categories]
                    .sort((a, b) =>
                      a.category_name.localeCompare(b.category_name),
                    )
                    .map((c) => ({
                      category_name: c.category_name,
                      hours: c.hours,
                    })),
                }))
                .sort((a, b) => a.qa_name.localeCompare(b.qa_name)),
            );

          const newForDiff = newQAEntries.map((e) => ({
            qa_name: e.qa_name,
            categories: e.categories.map((c) => ({
              category_name: c.category_name,
              hours: c.hours,
            })),
          }));

          // Solo escribir en BD y registrar auditoría si los valores cambiaron realmente.
          // Nota: rows.length > 0 NO forma parte del diff — si ClickUp deja de reportar
          // horas QA (rows=[]) pero la BD tiene datos previos, hay que borrarlos igual.
          const hasActualChanges =
            normalizeEntries(oldQAEntries) !== normalizeEntries(newForDiff);

          if (hasActualChanges) {
            if (categoryIds.length > 0) {
              const { error: deleteError } = await supabase
                .from("timing_qa_category_hours")
                .delete()
                .in("timing_qa_entry_id", entryIds)
                .in("category_id", categoryIds);

              if (deleteError) {
                throw new Error(
                  `Error al eliminar registros en BD: ${deleteError.message}`,
                );
              }
            }

            // Solo hacer upsert si hay filas nuevas — si rows=[] la tarea salió de QA
            // y el delete anterior ya limpió los datos stale.
            if (rows.length > 0) {
              const { error: upsertError } = await supabase
                .from("timing_qa_category_hours")
                .upsert(rows, {
                  onConflict: "timing_qa_entry_id,category_id",
                });

              if (upsertError) {
                throw new Error(
                  `Error al guardar registros en BD: ${upsertError.message}`,
                );
              }
            }

            // Step 5a: Real write happened — update sync record.
            const { error: syncUpdateError } = await supabase
              .from("clickup_task_sync")
              .update({
                last_synced_at: new Date().toISOString(),
                last_clickup_status: latestStatus,
                ...(latestStatus && isTerminalStatus(latestStatus)
                  ? { sync_enabled: false }
                  : {}),
              })
              .eq("task_id", internalTaskId);

            if (syncUpdateError) {
              throw new Error(
                `Error de BD al actualizar clickup_task_sync: ${syncUpdateError.message}`,
              );
            }

            // Step 5c: Emit audit log — solo cuando los valores cambiaron realmente.
            // Si se pasa userCtx (sync manual desde UI), se atribuye al usuario real.
            // Si no (cron), se usa system@cron.local.
            const systemUserId = process.env.SYSTEM_USER_ID ?? "system";
            const auditUserId = userCtx?.userId ?? systemUserId;
            const auditUserEmail = userCtx?.userEmail ?? "system@cron.local";
            const syncedBy = userCtx ? "clickup-ui" : "clickup-cron";
            void (async () => {
              try {
                const { data: taskRow } = await supabase
                  .from("tasks")
                  .select("name")
                  .eq("id", internalTaskId)
                  .maybeSingle();
                const name = taskRow?.name ?? internalTaskId;
                const month = taskMeta?.month ?? 0;
                const year = taskMeta?.year ?? 0;
                await supabase.from("audit_logs").insert({
                  user_id: auditUserId,
                  user_email: auditUserEmail,
                  action: "UPDATE",
                  entity_type: "TIMING",
                  entity_id: latestTiming.id,
                  entity_name: `${name} ${month}/${year}`,
                  old_values: { qa_entries: oldQAEntries },
                  new_values: {
                    qa_entries: newQAEntries,
                    synced_by: syncedBy,
                  },
                  timestamp: new Date().toISOString(),
                });
              } catch {
                // Audit failure must never abort the sync
              }
            })();

            return {
              taskId: internalTaskId,
              clickupTaskId: clickupQaTaskId,
              success: true,
            };
          }
        }
      }
    }

    // Step 5b: Nothing was written (no timing row, no qa entries, or no mapped
    // statuses). Record the attempt timestamp but signal skipped so callers
    // can distinguish "sync ran but had nothing to write" from success.
    const { error: skipUpdateError } = await supabase
      .from("clickup_task_sync")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("task_id", internalTaskId);

    if (skipUpdateError) {
      throw new Error(
        `Error de BD al actualizar clickup_task_sync (ruta omitida): ${skipUpdateError.message}`,
      );
    }

    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: true,
      skipped: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Fire-and-forget: record the error timestamp without blocking the return.
    void supabase
      .from("clickup_task_sync")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("task_id", internalTaskId);

    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: false,
      error: message,
    };
  }
}

/**
 * Fetch all tasks that have sync enabled and run syncTaskTimings on each.
 * Only syncs tasks in status "Pendiente" that belong to the current month/year,
 * so that Completada/Deprecada tasks and past-month tasks are not re-synced
 * automatically. Manual syncs (via the API route) always bypass this filter.
 * Returns an array of SyncResult for observability / logging.
 */
export async function syncAllEnabledTasks(): Promise<SyncResult[]> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error("Cliente de servicio no disponible");

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // getMonth() is 0-indexed
  const currentYear = now.getFullYear();

  // Join with tasks to filter: only Pendiente tasks for the current month/year.
  // tasks!inner ensures rows without a matching task are excluded.
  const { data: syncRows, error } = await supabase
    .from("clickup_task_sync")
    .select("task_id, clickup_qa_task_id, tasks!inner(status, month, year)")
    .eq("sync_enabled", true)
    .eq("tasks.status", "Pendiente")
    .eq("tasks.month", currentMonth)
    .eq("tasks.year", currentYear);

  if (error) {
    throw new Error(
      `Error al obtener filas de sincronización: ${error.message}`,
    );
  }

  if (syncRows && syncRows.length > 0) {
    console.warn(
      `[syncAllEnabledTasks] Se encontraron ${syncRows.length} tarea(s) Pendiente ` +
        `para ${currentMonth}/${currentYear} con sincronización habilitada.`,
    );
  }

  if (!syncRows || syncRows.length === 0) return [];

  // Stop before reaching Vercel's 300 s maxDuration to avoid partial/timed-out
  // responses. 270 s gives ~30 s headroom for teardown and response writing.
  const BUDGET_MS = 270_000;
  const deadline = Date.now() + BUDGET_MS;

  // Run syncs sequentially to avoid hammering the ClickUp API
  const results: SyncResult[] = [];
  for (const row of syncRows) {
    if (Date.now() >= deadline) {
      console.warn(
        "[syncAllEnabledTasks] Presupuesto de tiempo agotado — deteniendo antes de completar. " +
          `Procesadas ${results.length}/${syncRows.length} tareas.`,
      );
      break;
    }
    const result = await syncTaskTimings(
      row.task_id as string,
      row.clickup_qa_task_id as string,
    );
    results.push(result);
    // Small delay between requests to respect rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}
