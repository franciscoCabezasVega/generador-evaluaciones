import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  listQAEvaluationsForRange,
  upsertQAEvaluation,
} from "@/lib/services/qaEvaluationService";
import { UpsertQAEvaluationInput } from "@/lib/types";

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

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date y end_date son requeridos" },
        { status: 400 },
      );
    }

    // Validar formato de fecha (YYYY-MM-DD)
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

    const rows = await listQAEvaluationsForRange(supabase, startDate, endDate);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error en GET /api/qa-evaluations:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, isLead, supabase } = authCtx;

    if (!isLead) {
      return NextResponse.json(
        { error: "No tienes permisos para crear evaluaciones de QA" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Partial<UpsertQAEvaluationInput>;

    // Validaciones de campos requeridos
    if (!body.qa_id || !body.start_date || !body.end_date) {
      return NextResponse.json(
        { error: "qa_id, start_date y end_date son requeridos" },
        { status: 400 },
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.start_date) || !dateRegex.test(body.end_date)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Use YYYY-MM-DD" },
        { status: 400 },
      );
    }

    if (body.start_date > body.end_date) {
      return NextResponse.json(
        { error: "start_date no puede ser posterior a end_date" },
        { status: 400 },
      );
    }

    // Validar rango de excelencia y soft_skills (0-5)
    if (
      body.excelencia !== null &&
      body.excelencia !== undefined &&
      (body.excelencia < 0 || body.excelencia > 5)
    ) {
      return NextResponse.json(
        { error: "excelencia debe estar entre 0 y 5" },
        { status: 400 },
      );
    }
    if (
      body.soft_skills !== null &&
      body.soft_skills !== undefined &&
      (body.soft_skills < 0 || body.soft_skills > 5)
    ) {
      return NextResponse.json(
        { error: "soft_skills debe estar entre 0 y 5" },
        { status: 400 },
      );
    }

    // Verificar si la evaluación ya existe para determinar CREATE vs UPDATE
    const { data: existing } = await supabase
      .from("qa_evaluations")
      .select("id")
      .eq("qa_id", body.qa_id)
      .eq("start_date", body.start_date)
      .eq("end_date", body.end_date)
      .maybeSingle();

    const isCreate = !existing;

    const input: UpsertQAEvaluationInput = {
      qa_id: body.qa_id,
      start_date: body.start_date,
      end_date: body.end_date,
      excelencia: body.excelencia ?? null,
      soft_skills: body.soft_skills ?? null,
      comentarios: body.comentarios ?? null,
    };

    const saved = await upsertQAEvaluation(supabase, user.id, input);

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        action: isCreate ? "CREATE" : "UPDATE",
        entity_type: "QA_EVALUATION",
        entity_id: saved.id,
        entity_name: `QA Evaluation ${body.start_date} - ${body.end_date}`,
        new_values: saved,
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.error("Error en audit log de QA evaluation:", auditErr);
    }

    return NextResponse.json(saved, { status: isCreate ? 201 : 200 });
  } catch (error) {
    console.error("Error en POST /api/qa-evaluations:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
