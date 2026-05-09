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
      if (!Number.isInteger(value)) {
        throw new Error(`${fieldName} must be an integer (no decimals)`);
      }
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
        validateHours(
          entry.effective_testing_hours,
          `QA ${entry.qa_name}: effective_testing_hours`,
        );
        validateHours(
          entry.waiting_environment_hours,
          `QA ${entry.qa_name}: waiting_environment_hours`,
        );
        validateHours(
          entry.waiting_development_fixes_hours,
          `QA ${entry.qa_name}: waiting_development_fixes_hours`,
        );
        validateHours(entry.retest_hours, `QA ${entry.qa_name}: retest_hours`);
        validateHours(
          entry.clarification_hours,
          `QA ${entry.qa_name}: clarification_hours`,
        );
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

    await timingService.deleteTiming(id, token);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error in DELETE /api/timings/[id]:", error);
    return NextResponse.json(
      { error: "Error deleting timing" },
      { status: 500 },
    );
  }
}
