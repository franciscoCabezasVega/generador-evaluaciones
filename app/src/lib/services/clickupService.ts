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

import { getServiceClient } from "@/lib/auth";
import { decryptText } from "@/lib/encryption";

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
async function getClickUpApiKey(): Promise<string | null> {
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
    throw new Error(`DB error reading clickup_settings: ${error.message}`);
  }
  if (!data) return null;

  try {
    return await decryptText(data.encrypted_key, data.key_iv);
  } catch (err) {
    // Distinguish decryption failure from "not configured" so callers can
    // surface a meaningful diagnostic instead of a generic "not configured".
    throw new Error(
      `ClickUp API key decryption failed — the stored ciphertext may be corrupt or CLICKUP_ENCRYPTION_KEY has changed. Original error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

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
      `ClickUp API error ${response.status} for task ${taskId}: ${body}`,
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

// ── Main export ────────────────────────────────────────────────────────────

export interface SyncResult {
  taskId: string;
  clickupTaskId: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
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

    // Step 3: Map ClickUp statuses → { slug: hours }
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
        throw new Error(`DB error reading task: ${taskMetaError.message}`);
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
          throw new Error(`DB error reading task_timings: ${tError.message}`);
        }
        latestTiming = tData;
      }

      if (latestTiming) {
        // 4b. Find all QA entries for this (single) timing row only.
        const { data: qaEntries, error: qaError } = await supabase
          .from("timing_qa_entries")
          .select("id")
          .eq("timing_id", latestTiming.id);

        if (qaError) {
          throw new Error(
            `DB error reading timing_qa_entries: ${qaError.message}`,
          );
        }

        if (qaEntries && qaEntries.length > 0) {
          // 4c. Resolve category IDs by slug.
          const { data: categories, error: catError } = await supabase
            .from("timing_categories")
            .select("id, slug")
            .in("slug", slugs);

          if (catError) {
            throw new Error(
              `DB error reading timing_categories: ${catError.message}`,
            );
          }

          const categoryMap = new Map<string, string>(
            (categories ?? []).map((c) => [c.slug as string, c.id as string]),
          );

          // 4d. Divide hours equally among all QA entries so no member gets
          //     the full total when multiple QAs share the task.
          //     We first DELETE existing rows for these entries/categories so
          //     the sync always reflects the latest ClickUp data (no stale
          //     leftovers from previous syncs).
          const qaCount = qaEntries.length;
          const entryIds = qaEntries.map((e) => e.id as string);
          const categoryIds = Array.from(categoryMap.values());

          if (categoryIds.length > 0) {
            const { error: deleteError } = await supabase
              .from("timing_qa_category_hours")
              .delete()
              .in("timing_qa_entry_id", entryIds)
              .in("category_id", categoryIds);

            if (deleteError) {
              throw new Error(`DB delete failed: ${deleteError.message}`);
            }
          }

          const rows = qaEntries.flatMap((entry) =>
            Object.entries(categoryHours)
              .filter(([slug]) => categoryMap.has(slug))
              .map(([slug, hours]) => ({
                timing_qa_entry_id: entry.id as string,
                category_id: categoryMap.get(slug)!,
                hours: Math.round((hours / qaCount) * 100) / 100,
              })),
          );

          if (rows.length > 0) {
            const { error: upsertError } = await supabase
              .from("timing_qa_category_hours")
              .upsert(rows, {
                onConflict: "timing_qa_entry_id,category_id",
              });

            if (upsertError) {
              throw new Error(`DB upsert failed: ${upsertError.message}`);
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
                `DB error updating clickup_task_sync: ${syncUpdateError.message}`,
              );
            }

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
        `DB error updating clickup_task_sync (skipped path): ${skipUpdateError.message}`,
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
  if (!supabase) throw new Error("Service client unavailable");

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
    throw new Error(`Failed to fetch sync rows: ${error.message}`);
  }

  if (syncRows && syncRows.length > 0) {
    console.warn(
      `[syncAllEnabledTasks] Found ${syncRows.length} Pendiente task(s) ` +
        `for ${currentMonth}/${currentYear} with sync enabled.`,
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
        "[syncAllEnabledTasks] Time budget exceeded — stopping early. " +
          `Processed ${results.length}/${syncRows.length} tasks.`,
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
