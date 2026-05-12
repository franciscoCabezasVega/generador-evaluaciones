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
 * Adjust to match your team's actual ClickUp workflow statuses.
 */
const STATUS_CATEGORY_MAP: Record<string, string> = {
  // Testing / QA active → effective_testing
  "in testing": "effective_testing",
  "in qa": "effective_testing",
  testing: "effective_testing",
  qa: "effective_testing",
  // Waiting for environment → waiting_environment
  "waiting env": "waiting_environment",
  "waiting environment": "waiting_environment",
  "wait env": "waiting_environment",
  "espera ambiente": "waiting_environment",
  // Waiting for dev fixes → waiting_development_fixes
  "waiting fixes": "waiting_development_fixes",
  "waiting fix": "waiting_development_fixes",
  "wait fix": "waiting_development_fixes",
  "in review": "waiting_development_fixes",
  "espera fixes": "waiting_development_fixes",
  // Retest → qa_retesting
  retest: "qa_retesting",
  "re-test": "qa_retesting",
  retesting: "qa_retesting",
  // Clarifications → clarification
  clarification: "clarification",
  clarifications: "clarification",
  "in clarification": "clarification",
  "clarificación": "clarification",
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Retrieve and decrypt the stored ClickUp API key. Returns null if not set. */
async function getClickUpApiKey(): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("clickup_settings")
    .select("encrypted_key, key_iv")
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = "JSON object requested, multiple (or no) rows returned"
    // i.e. no key has been configured yet — return null (not an error).
    if (error.code === "PGRST116") return null;
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
  // If it contains a slash, try to parse as URL
  if (input.includes("/")) {
    const match = input.match(/\/t\/([a-zA-Z0-9]+)/);
    if (match) return match[1];
    // Fallback: last path segment
    const parts = input.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? input;
  }
  return input.trim();
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
    signal: AbortSignal.timeout(30_000),
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
      result[slug] = (result[slug] ?? 0) + entry.total_time.by_minute / 60;
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
      error: err instanceof Error ? err.message : "ClickUp API key decryption failed",
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
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // 4a. Find the existing task_timing row for this month/year.
      //     We do NOT create one here — that requires a user_id which only
      //     the QA member can supply via the UI.
      const { data: timing, error: timingError } = await supabase
        .from("task_timings")
        .select("id")
        .eq("task_id", internalTaskId)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();

      if (timingError) {
        throw new Error(`DB error reading task_timings: ${timingError.message}`);
      }

      if (timing) {
        // 4b. Find all QA-member entries for this timing record.
        const { data: qaEntries, error: qaError } = await supabase
          .from("timing_qa_entries")
          .select("id")
          .eq("timing_id", timing.id);

        if (qaError) {
          throw new Error(`DB error reading timing_qa_entries: ${qaError.message}`);
        }

        // Use only the FIRST qa_entry to avoid inflating totals.
        // If a task has multiple QA members the correct entry cannot be
        // determined from time_in_status alone (it has no per-assignee
        // breakdown). Writing to all entries would multiply the hours by N.
        // A future improvement: resolve the entry via clickup_user_id.
        const targetEntry = qaEntries?.[0];
        if (targetEntry) {
          // 4c. Resolve category IDs by slug.
          const { data: categories, error: catError } = await supabase
            .from("timing_categories")
            .select("id, slug")
            .in("slug", slugs);

          if (catError) {
            throw new Error(`DB error reading timing_categories: ${catError.message}`);
          }

          const categoryMap = new Map<string, string>(
            (categories ?? []).map((c) => [c.slug as string, c.id as string]),
          );

          // 4d. Build upsert rows and write them.
          const rows = Object.entries(categoryHours)
            .filter(([slug]) => categoryMap.has(slug))
            .map(([slug, hours]) => ({
              timing_qa_entry_id: targetEntry.id as string,
              category_id: categoryMap.get(slug)!,
              hours: Math.round(hours * 100) / 100,
            }));

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
              throw new Error(`DB error updating clickup_task_sync: ${syncUpdateError.message}`);
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
    await supabase
      .from("clickup_task_sync")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("task_id", internalTaskId);

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
 * Returns an array of SyncResult for observability / logging.
 */
export async function syncAllEnabledTasks(): Promise<SyncResult[]> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error("Service client unavailable");

  const { data: syncRows, error } = await supabase
    .from("clickup_task_sync")
    .select("task_id, clickup_qa_task_id")
    .eq("sync_enabled", true);

  if (error) {
    throw new Error(`Failed to fetch sync rows: ${error.message}`);
  }

  if (!syncRows || syncRows.length === 0) return [];

  // Run syncs sequentially to avoid hammering the ClickUp API
  const results: SyncResult[] = [];
  for (const row of syncRows) {
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
