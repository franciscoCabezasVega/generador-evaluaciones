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
      return NextResponse.json(
        { error: "Timing no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json(timing, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/timings/[id]:", error);
    return NextResponse.json(
      { error: "Error al obtener el timing" },
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
        throw new Error(`${fieldName} debe ser un número`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`${fieldName} debe ser un número finito`);
      }
      // Allow decimals: ClickUp sync writes values like 20.88 or 9.41
      // (hours-in-status divided among QA members). The DB column is NUMERIC(10,2).
      if (value < 0) {
        throw new Error(`${fieldName} debe ser un número no negativo`);
      }
    };

    try {
      for (let i = 0; i < body.qa_entries.length; i++) {
        const entry = body.qa_entries[i];
        if (!entry.qa_name || entry.qa_name.trim() === "") {
          throw new Error(`Entrada QA ${i + 1}: qa_name es obligatorio`);
        }

        if (
          !entry.hours_by_category ||
          typeof entry.hours_by_category !== "object" ||
          Array.isArray(entry.hours_by_category)
        ) {
          throw new Error(
            `QA ${entry.qa_name}: hours_by_category debe ser un objeto`,
          );
        }

        let entryTotal = 0;
        for (const [catId, hours] of Object.entries(entry.hours_by_category)) {
          if (!catId || catId.trim() === "") {
            throw new Error(
              `QA ${entry.qa_name}: el id de categoría no puede estar vacío`,
            );
          }
          validateHours(
            hours as number,
            `QA ${entry.qa_name}: categoría ${catId}`,
          );
          entryTotal += hours as number;
        }

        if (entryTotal === 0) {
          throw new Error(
            `QA ${entry.qa_name}: al menos una categoría debe tener horas > 0`,
          );
        }
      }

      // Check for duplicate QA names
      const qaNames = body.qa_entries.map((e) => e.qa_name);
      const uniqueNames = new Set(qaNames);
      if (uniqueNames.size !== qaNames.length) {
        throw new Error("No se permiten nombres de QA duplicados");
      }
    } catch (validationError) {
      return NextResponse.json(
        { error: (validationError as Error).message },
        { status: 400 },
      );
    }

    // Capture current state BEFORE updating for audit diff
    type AuditQAEntry = {
      qa_name: string;
      categories: { category_name: string; hours: number }[];
    };
    let oldQAEntries: AuditQAEntry[] = [];
    let catIdToName: Record<string, string> = {};
    try {
      const snapshotClient = getAuthenticatedSupabase(token);
      const { data: cats } = await snapshotClient
        .from("timing_categories")
        .select("id, name");
      catIdToName = Object.fromEntries(
        (cats ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
      );
      const existing = await timingService.getTimingById(id, token);
      if (existing?.qa_entries) {
        oldQAEntries = existing.qa_entries.map((e) => ({
          qa_name: e.qa_name,
          categories: Object.entries(e.hours_by_category ?? {})
            .filter(([, h]) => (h as number) > 0)
            .map(([catId, hours]) => ({
              category_name: catIdToName[catId] ?? catId,
              hours: hours as number,
            })),
        }));
      }
    } catch {
      // Non-fatal: proceed without old values
    }

    const timing = await timingService.updateTiming(id, body, token);

    if (!timing) {
      return NextResponse.json(
        { error: "Timing no encontrado" },
        { status: 404 },
      );
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
        const newQAEntries: AuditQAEntry[] = body.qa_entries.map((e) => ({
          qa_name: e.qa_name,
          categories: Object.entries(e.hours_by_category ?? {})
            .filter(([, h]) => (h as unknown as number) > 0)
            .map(([catId, hours]) => ({
              category_name: catIdToName[catId] ?? catId,
              hours: hours as unknown as number,
            })),
        }));

        // Solo registrar si los valores realmente cambiaron
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

        if (normalizeEntries(oldQAEntries) === normalizeEntries(newQAEntries)) {
          return; // Sin cambios reales — no registrar en auditoría
        }

        await supabase.from("audit_logs").insert({
          user_id: user.id,
          user_email: userEmailPut,
          action: "UPDATE",
          entity_type: "TIMING",
          entity_id: timing.id,
          entity_name: `${taskName} ${timing.month}/${timing.year}`,
          old_values: { qa_entries: oldQAEntries },
          new_values: { qa_entries: newQAEntries },
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
      { error: "Error al eliminar el timing" },
      { status: 500 },
    );
  }
}
