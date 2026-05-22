import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { CreateTaskTimingInput } from "@/lib/types";
import { getUserFromRequest, getAuthenticatedSupabase } from "@/lib/auth";
import { timingService } from "@/lib/services/timingService";

/**
 * GET /api/timings
 * Obtener tiempos con filtros (incluye QA entries)
 * Query params: month, year, task_id
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!)
      : undefined;
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!)
      : undefined;
    const task_id = searchParams.get("task_id") || undefined;
    const startDate = searchParams.get("start_date") || undefined;
    const endDate = searchParams.get("end_date") || undefined;
    const product_type = searchParams.get("product_type") || undefined;

    const timings = await timingService.getTimings(
      { month, year, task_id, startDate, endDate, product_type },
      token,
    );

    return NextResponse.json(timings, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/timings:", error);
    return NextResponse.json(
      { error: "Error fetching timings" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/timings
 * Crear un nuevo timing con QA entries
 * Body: CreateTaskTimingInput (with qa_entries array)
 */
export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as CreateTaskTimingInput;

    // Validaciones
    if (!body.task_id || body.month === undefined || body.year === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: task_id, month, year" },
        { status: 400 },
      );
    }

    // Validate qa_entries
    if (
      !body.qa_entries ||
      !Array.isArray(body.qa_entries) ||
      body.qa_entries.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one QA entry is required (qa_entries array)" },
        { status: 400 },
      );
    }

    // Validate each QA entry
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

        if (entryTotal === 0 && body.for_sync !== true) {
          // body.for_sync must be strictly boolean true; a string "true" or any
          // other truthy value does NOT bypass the zero-hours validation.
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

    const timing = await timingService.createTiming(
      {
        ...body,
        user_id: user.id,
      },
      token,
    );

    // Sync assigned_qa back to the task
    try {
      const qaNames = body.qa_entries.map((e) => e.qa_name);
      const supabase = getAuthenticatedSupabase(token);
      await supabase
        .from("tasks")
        .update({ assigned_qa: qaNames, updated_at: new Date().toISOString() })
        .eq("id", body.task_id);
    } catch (syncError) {
      console.error("Error syncing assigned_qa to task:", syncError);
    }

    // Register audit log async (does not block the response)
    const userEmail = user.email || "unknown";
    const timingId = timing?.id;
    after(async () => {
      try {
        const supabase = getAuthenticatedSupabase(token);
        const { data: taskData } = await supabase
          .from("tasks")
          .select("name")
          .eq("id", body.task_id)
          .maybeSingle();
        const taskName = taskData?.name ?? body.task_id;
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          user_email: userEmail,
          action: "CREATE",
          entity_type: "TIMING",
          entity_id: timingId,
          entity_name: `${taskName} ${body.month}/${body.year}`,
          new_values: {
            task_id: body.task_id,
            month: body.month,
            year: body.year,
            qa_entries: body.qa_entries,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (auditError) {
        console.error("Error logging audit action:", auditError);
      }
    });

    return NextResponse.json(timing, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/timings:", error);
    return NextResponse.json(
      { error: "Error al crear timing" },
      { status: 500 },
    );
  }
}
