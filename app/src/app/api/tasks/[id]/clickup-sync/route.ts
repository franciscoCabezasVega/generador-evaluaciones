import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, getServiceClient } from "@/lib/auth";
import { syncTaskTimings } from "@/lib/services/clickupService";

function normalizeStatusForDisplay(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("__cp__")) return raw;

  const payload = raw.slice("__cp__".length);
  const [statusEnc] = payload.split("|");
  if (!statusEnc) return null;

  try {
    return decodeURIComponent(statusEnc);
  } catch {
    return null;
  }
}

/**
 * GET /api/tasks/[id]/clickup-sync
 * Returns the ClickUp sync status for a task.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the task exists and belongs to this user (RLS-enforced)
  const { data: taskRow, error: taskErr } = await authCtx.supabase
    .from("tasks")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (taskErr || !taskRow) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("clickup_task_sync")
    .select(
      "sync_enabled, clickup_qa_task_id, last_synced_at, last_clickup_status",
    )
    .eq("task_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    registered: !!data,
    sync_enabled: data?.sync_enabled ?? false,
    clickup_qa_task_id: data?.clickup_qa_task_id ?? null,
    last_synced_at: data?.last_synced_at ?? null,
    last_clickup_status: normalizeStatusForDisplay(
      data?.last_clickup_status ?? null,
    ),
  });
}

/**
 * POST /api/tasks/[id]/clickup-sync
 * Body: { clickup_qa_task_id: string }
 *
 * Upserts the ClickUp task ID into clickup_task_sync (enables sync)
 * and immediately runs syncTaskTimings so timings are recorded right away.
 * The row stays registered for future cron runs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the task exists and belongs to this user (RLS-enforced)
  const { data: taskRowPost, error: taskErrPost } = await authCtx.supabase
    .from("tasks")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (taskErrPost || !taskRowPost) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clickupQaTaskId = (body as Record<string, unknown>)?.clickup_qa_task_id;
  if (typeof clickupQaTaskId !== "string" || !clickupQaTaskId.trim()) {
    return NextResponse.json(
      { error: "Debes ingresar el ID de la subtarea en ClickUp." },
      { status: 400 },
    );
  }

  const cleanId = clickupQaTaskId.trim();
  // preview_only=true: registra el ID en clickup_task_sync pero NO escribe
  // timing_qa_category_hours — solo devuelve la vista previa de horas al cliente.
  const previewOnly = (body as Record<string, unknown>)?.preview_only === true;

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  // 1. Upsert into clickup_task_sync so the cron picks it up on future runs
  const { error: upsertError } = await supabase
    .from("clickup_task_sync")
    .upsert(
      {
        task_id: id,
        clickup_qa_task_id: cleanId,
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "task_id" },
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // 2. Run the sync.
  // previewOnly=true: solo computa las horas desde ClickUp y las devuelve en la respuesta,
  // sin escribir en timing_qa_category_hours ni en audit_logs.
  // Pasar el contexto del usuario para que el audit quede en su nombre (no system@cron.local).
  const result = await syncTaskTimings(
    id,
    cleanId,
    { userId: authCtx.user.id, userEmail: authCtx.user.email ?? "" },
    { previewOnly },
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Error al sincronizar con ClickUp" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    skipped: result.skipped ?? false,
    clickup_qa_task_id: cleanId,
    ...(result.taskStatusChanged ? { taskStatusChanged: true } : {}),
    ...(result.preview_qa_entries
      ? { preview_qa_entries: result.preview_qa_entries }
      : {}),
  });
}
