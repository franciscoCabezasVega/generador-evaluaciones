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
        throw new Error(`${fieldName} must be a number`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a finite number`);
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

        if (entryTotal === 0 && !body.for_sync) {
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

    return NextResponse.json(timing, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/timings:", error);
    return NextResponse.json(
      { error: "Error al crear timing" },
      { status: 500 },
    );
  }
}
