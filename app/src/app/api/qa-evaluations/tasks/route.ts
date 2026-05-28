import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { isLead, supabase } = authCtx;

    if (!isLead) {
      return NextResponse.json(
        { error: "Acceso restringido a leads" },
        { status: 403 },
      );
    }

    const { searchParams } = request.nextUrl;
    const qaName = searchParams.get("qa_name");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!qaName || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Se requieren los parámetros: qa_name, start_date, end_date" },
        { status: 400 },
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Use YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "start_date no puede ser posterior a end_date" },
        { status: 400 },
      );
    }

    // Obtener task_ids asignados al QA en el mes/año de evaluación.
    // month/year and effort_score_date are independent — se filtra por período
    // de evaluación, no por la fecha de esfuerzo.
    const evalYear = parseInt(startDate.substring(0, 4));
    const evalMonth = parseInt(startDate.substring(5, 7));

    const { data: taskQaRows, error: tqErr } = await supabase
      .from("task_qa")
      .select("task_id, tasks!inner(id, month, year)")
      .eq("qa_name", qaName)
      .eq("tasks.month", evalMonth)
      .eq("tasks.year", evalYear);

    if (tqErr) {
      return NextResponse.json({ error: tqErr.message }, { status: 500 });
    }

    const taskIds = [
      ...new Set(
        ((taskQaRows as { task_id: string }[]) ?? []).map((r) => r.task_id),
      ),
    ];

    if (taskIds.length === 0) {
      return NextResponse.json([]);
    }

    // Obtener datos completos de las tareas
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select(
        "id, name, task_link, status, month, year, effort_score_date, product_type, tshirt_size",
      )
      .in("id", taskIds)
      .order("effort_score_date", { ascending: false });

    if (tasksErr) {
      return NextResponse.json({ error: tasksErr.message }, { status: 500 });
    }

    // Obtener task_qa.id para este QA en estas tareas (para buscar horas)
    const { data: taskQaForQA, error: tqForQAErr } = await supabase
      .from("task_qa")
      .select("id, task_id")
      .eq("qa_name", qaName)
      .in("task_id", taskIds);

    if (tqForQAErr) {
      return NextResponse.json({ error: tqForQAErr.message }, { status: 500 });
    }

    const taskQaIdByTaskId: Record<string, string> = {};
    for (const tq of (taskQaForQA ?? []) as { id: string; task_id: string }[]) {
      taskQaIdByTaskId[tq.task_id] = tq.id;
    }

    // Horas reales del QA por task_qa_id
    const taskQaIds2 = Object.values(taskQaIdByTaskId);
    const hoursMap: Record<string, number> = {};

    if (taskQaIds2.length > 0) {
      const { data: entries, error: entriesErr } = await supabase
        .from("timing_qa_entries")
        .select("task_qa_id, timing_qa_category_hours(hours)")
        .in("task_qa_id", taskQaIds2);

      if (entriesErr) {
        return NextResponse.json(
          { error: entriesErr.message },
          { status: 500 },
        );
      }

      for (const entry of (entries ?? []) as Record<string, unknown>[]) {
        const tqId = entry.task_qa_id as string;
        const hrs = (
          entry.timing_qa_category_hours as { hours: number }[]
        ).reduce((s, h) => s + (h.hours ?? 0), 0);
        hoursMap[tqId] = (hoursMap[tqId] ?? 0) + hrs;
      }
    }

    // Complejidades para horas esperadas
    const { data: complexitiesRaw, error: complexitiesErr } = await supabase
      .from("complexities")
      .select("name, min_hours, max_hours")
      .eq("is_active", true);

    if (complexitiesErr) {
      return NextResponse.json(
        { error: complexitiesErr.message },
        { status: 500 },
      );
    }

    const complexityMap: Record<string, { min: number; max: number }> = {};
    for (const c of (complexitiesRaw ?? []) as {
      name: string;
      min_hours: number;
      max_hours: number;
    }[]) {
      complexityMap[c.name] = { min: c.min_hours, max: c.max_hours };
    }

    const tasksWithData = (tasks ?? []).map((task: Record<string, unknown>) => {
      const taskQaId = taskQaIdByTaskId[task.id as string];
      const realHours = taskQaId ? (hoursMap[taskQaId] ?? 0) : 0;
      const cx = complexityMap[task.tshirt_size as string] ?? null;
      return {
        ...task,
        real_qa_hours: realHours,
        expected_min_hours: cx?.min ?? null,
        expected_max_hours: cx?.max ?? null,
      };
    });

    return NextResponse.json(tasksWithData);
  } catch (error) {
    console.error("Error fetching QA tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
