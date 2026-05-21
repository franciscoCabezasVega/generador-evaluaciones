import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { UpdateTaskTimingInput } from "@/lib/types";
import { getUserFromRequest, getAuthenticatedSupabase } from "@/lib/auth";
import { timingService } from "@/lib/services/timingService";

/**
 * GET /api/timings/[id]
 * Obtener un timing específico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extraer token del header Authorization para Supabase
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.substring("Bearer ".length);

    const { id } = await params;

    const timing = await timingService.getTimingById(id, token);

    if (!timing) {
      return NextResponse.json({ error: "Timing not found" }, { status: 404 });
    }

    return NextResponse.json(timing, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/timings/[id]:", error);
    return NextResponse.json(
      { error: "Error fetching timing" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/timings/[id]
 * Actualizar un timing (con soporte para QA entries)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.substring("Bearer ".length);

    const { id } = await params;
    const body = (await request.json()) as UpdateTaskTimingInput;

    // Validate QA entries (required, no legacy mode)
    if (
      !body.qa_entries ||
      !Array.isArray(body.qa_entries) ||
      body.qa_entries.length === 0
    ) {
      return NextResponse.json(
        { error: "qa_entries array is required and cannot be empty" },
        { status: 400 },
      );
    }

    const validateHours = (value: number, fieldName: string) => {
      if (typeof value !== "number") {
        throw new Error(`${fieldName} must be a number`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a finite number`);
      }
      // Allow decimals: ClickUp sync writes values like 20.88 or 9.41
      // (hours-in-status divided among QA members). The DB column is NUMERIC(10,2).
      if (value < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
      }
    };

    try {
      for (let i = 0; i < body.qa_entries.length; i++) {
        const entry = body.qa_entries[i];
        if (!entry.qa_name || entry.qa_name.trim() === "") {
          throw new Error(`QA entry ${i + 1}: qa_name is required`);
        }

        if (
          !entry.hours_by_category ||
          typeof entry.hours_by_category !== "object" ||
          Array.isArray(entry.hours_by_category)
        ) {
          throw new Error(
            `QA ${entry.qa_name}: hours_by_category must be an object`,
          );
        }

        let entryTotal = 0;
        for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
          if (!catId || catId.trim() === "") {
            throw new Error(`QA ${entry.qa_name}: category id cannot be empty`);
          }
          validateHours(
            hours as number,
            `QA ${entry.qa_name}: category ${catId}`,
          );
          entryTotal += hours as number;
        }

        if (entryTotal === 0) {
          throw new Error(
            `QA ${entry.qa_name}: at least one timing category must have hours > 0`,
          );
        }
      }

      // Check for duplicate QA names
      const qaNames = body.qa_entries.map((e) => e.qa_name);
      const uniqueNames = new Set(qaNames);
      if (uniqueNames.size !== qaNames.length) {
        throw new Error("Duplicate QA names are not allowed");
      }
    } catch (validationError) {
      return NextResponse.json(
        { error: (validationError as Error).message },
        { status: 400 },
      );
    }

    const timing = await timingService.updateTiming(id, body, token);

    if (!timing) {
      return NextResponse.json({ error: "Timing not found" }, { status: 404 });
    }

    // Sync assigned_qa back to the task
    try {
      const qaNames = body.qa_entries.map((e) => e.qa_name);
      const supabase = getAuthenticatedSupabase(token);
      // Get task_id from the timing
      if (timing.task_id) {
        await supabase
          .from("tasks")
          .update({
            assigned_qa: qaNames,
            updated_at: new Date().toISOString(),
          })
          .eq("id", timing.task_id);
      }
    } catch (syncError) {
      console.error("Error syncing assigned_qa to task:", syncError);
    }

    // Register audit log async (does not block the response)
    const userEmailPut = user.email || "unknown";
    after(async () => {
      try {
        const supabase = getAuthenticatedSupabase(token);
        const { data: taskData } = await supabase
          .from("tasks")
          .select("name")
          .eq("id", timing.task_id)
          .maybeSingle();
        const taskName = taskData?.name ?? timing.task_id;
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          user_email: userEmailPut,
          action: "UPDATE",
          entity_type: "TIMING",
          entity_id: timing.id,
          entity_name: `${taskName} ${timing.month}/${timing.year}`,
          new_values: { qa_entries: body.qa_entries },
          timestamp: new Date().toISOString(),
        });
      } catch (auditError) {
        console.error("Error logging audit action:", auditError);
      }
    });

    return NextResponse.json(timing, { status: 200 });
  } catch (error) {
    console.error("Error in PUT /api/timings/[id]:", error);
    return NextResponse.json(
      { error: "Error al actualizar timing" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/timings/[id]
 * Eliminar un timing
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extraer token del header Authorization para Supabase
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.substring("Bearer ".length);

    const { id } = await params;

    // Fetch timing info before deletion to capture entity details for audit
    let timingSnapshot: {
      task_id: string;
      month: number;
      year: number;
    } | null = null;
    try {
      const existing = await timingService.getTimingById(id, token);
      if (existing) {
        timingSnapshot = {
          task_id: existing.task_id,
          month: existing.month,
          year: existing.year,
        };
      }
    } catch {
      // Non-fatal: proceed with deletion even if snapshot fails
    }

    await timingService.deleteTiming(id, token);

    // Register audit log async (does not block the response)
    const userEmailDel = user.email || "unknown";
    after(async () => {
      try {
        const supabase = getAuthenticatedSupabase(token);
        let entityName = id;
        if (timingSnapshot) {
          const { data: taskData } = await supabase
            .from("tasks")
            .select("name")
            .eq("id", timingSnapshot.task_id)
            .maybeSingle();
          const taskName = taskData?.name ?? timingSnapshot.task_id;
          entityName = `${taskName} ${timingSnapshot.month}/${timingSnapshot.year}`;
        }
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          user_email: userEmailDel,
          action: "DELETE",
          entity_type: "TIMING",
          entity_id: id,
          entity_name: entityName,
          old_values: timingSnapshot ?? undefined,
          timestamp: new Date().toISOString(),
        });
      } catch (auditError) {
        console.error("Error logging audit action:", auditError);
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in DELETE /api/timings/[id]:", error);
    return NextResponse.json(
      { error: "Error deleting timing" },
      { status: 500 },
    );
  }
}
