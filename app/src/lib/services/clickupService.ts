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
  /** Total time in this status in milliseconds */
  total_time: {
    by_minute: number;
    since: string;
  };
  orderindex: number;
}

interface ClickUpTimeInStatusResponse {
  status_history: ClickUpTimeInStatus[];
}

/** Represents the resolved timing breakdown ready to upsert. */
interface ResolvedTimingBreakdown {
  testing_time_minutes: number;
  waiting_env_minutes: number;
  waiting_fixes_minutes: number;
  retest_minutes: number;
  clarification_minutes: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

/**
 * Maps ClickUp status names (lowercase) to internal timing categories.
 * Adjust to match your team's actual ClickUp workflow statuses.
 */
const STATUS_CATEGORY_MAP: Record<string, keyof ResolvedTimingBreakdown> = {
  // Testing / QA active
  "in testing": "testing_time_minutes",
  "in qa": "testing_time_minutes",
  testing: "testing_time_minutes",
  qa: "testing_time_minutes",
  // Waiting for environment
  "waiting env": "waiting_env_minutes",
  "waiting environment": "waiting_env_minutes",
  "wait env": "waiting_env_minutes",
  "espera ambiente": "waiting_env_minutes",
  // Waiting for dev fixes
  "waiting fixes": "waiting_fixes_minutes",
  "waiting fix": "waiting_fixes_minutes",
  "wait fix": "waiting_fixes_minutes",
  "in review": "waiting_fixes_minutes",
  "espera fixes": "waiting_fixes_minutes",
  // Retest
  retest: "retest_minutes",
  "re-test": "retest_minutes",
  retesting: "retest_minutes",
  // Clarifications
  clarification: "clarification_minutes",
  clarifications: "clarification_minutes",
  "in clarification": "clarification_minutes",
  "clarificación": "clarification_minutes",
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

  if (error || !data) return null;

  try {
    return await decryptText(data.encrypted_key, data.key_iv);
  } catch {
    return null;
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
 * Map a list of ClickUp time-in-status entries to our internal timing breakdown.
 * Statuses not recognized are silently ignored.
 */
function mapStatusesToBreakdown(
  history: ClickUpTimeInStatus[],
): ResolvedTimingBreakdown {
  const result: ResolvedTimingBreakdown = {
    testing_time_minutes: 0,
    waiting_env_minutes: 0,
    waiting_fixes_minutes: 0,
    retest_minutes: 0,
    clarification_minutes: 0,
  };

  for (const entry of history) {
    const key = STATUS_CATEGORY_MAP[entry.status.toLowerCase()];
    if (key) {
      result[key] += entry.total_time.by_minute;
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
  const apiKey = await getClickUpApiKey();
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

    // Step 3: Map to breakdown
    const breakdown = mapStatusesToBreakdown(
      timeData.status_history ?? [],
    );

    // Determine the latest status (highest orderindex = most recent)
    const latestStatus = timeData.status_history?.reduce(
      (prev, curr) => (curr.orderindex > prev.orderindex ? curr : prev),
      timeData.status_history[0],
    )?.status ?? null;

    // Step 4: Upsert TaskTiming
    const { error: upsertError } = await supabase
      .from("task_timings")
      .upsert(
        {
          task_id: internalTaskId,
          ...breakdown,
          // Only update source fields; don't overwrite manually set notes/dates
          updated_at: new Date().toISOString(),
        },
        { onConflict: "task_id" },
      );

    if (upsertError) {
      throw new Error(`DB upsert failed: ${upsertError.message}`);
    }

    // Step 5: Update sync record
    await supabase
      .from("clickup_task_sync")
      .update({
        last_synced_at: new Date().toISOString(),
        last_clickup_status: latestStatus,
        // Disable sync if terminal status reached
        ...(latestStatus && isTerminalStatus(latestStatus)
          ? { sync_enabled: false }
          : {}),
      })
      .eq("task_id", internalTaskId);

    return {
      taskId: internalTaskId,
      clickupTaskId: clickupQaTaskId,
      success: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // Record the error in the sync table for observability
    await supabase
      .from("clickup_task_sync")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("task_id", internalTaskId)
      .then(() => {/* fire-and-forget */});

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
