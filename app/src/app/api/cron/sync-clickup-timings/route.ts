import { NextRequest, NextResponse } from "next/server";
import { syncAllEnabledTasks } from "@/lib/services/clickupService";

/**
 * GET /api/cron/sync-clickup-timings
 *
 * Triggered externally by cron-job.org. The schedule (frequency, timezone)
 * is configured in the cron-job.org console — not in this codebase.
 * Vercel Hobby plan does not support sub-daily crons; scheduling is delegated
 * to an external service. Can also be called manually for testing.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron/sync-clickup-timings] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const results = await syncAllEnabledTasks();

    // "succeeded" = actually wrote data; "skipped" = ran but nothing to write.
    // Keep them separate so cron stats reflect real writes, not no-ops.
    const succeeded = results.filter((r) => r.success && !r.skipped).length;
    const failed = results.filter((r) => !r.success).length;
    const skipped = results.filter((r) => r.skipped).length;

    const durationMs = Date.now() - startTime;

    console.warn(
      `[cron/sync-clickup-timings] Done in ${durationMs}ms — ` +
        `total=${results.length} succeeded=${succeeded} failed=${failed} skipped=${skipped}`,
    );

    if (failed > 0) {
      const errors = results
        .filter((r) => !r.success && r.error)
        .map((r) => ({ taskId: r.taskId, error: r.error }));
      console.warn("[cron/sync-clickup-timings] Failures:", errors);
    }

    return NextResponse.json({
      ok: true,
      total: results.length,
      succeeded,
      failed,
      skipped,
      durationMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-clickup-timings] Fatal error:", message);
    return NextResponse.json(
      { error: "Cron job failed", detail: message },
      { status: 500 },
    );
  }
}
