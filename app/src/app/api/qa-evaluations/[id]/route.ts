import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  updateQAEvaluation,
  deleteQAEvaluation,
} from "@/lib/services/qaEvaluationService";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, isLead, supabase } = authCtx;

    if (!isLead) {
      return NextResponse.json(
        { error: "No tienes permisos para editar evaluaciones de QA" },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Verificar que la evaluación existe
    const { data: existing, error: fetchErr } = await supabase
      .from("qa_evaluations")
      .select("id, qa_id, start_date, end_date")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json(
        { error: "Error al verificar la evaluación" },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { error: "Evaluación no encontrada" },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      excelencia?: number | null;
      soft_skills?: number | null;
      comentarios?: string | null;
    };

    // Validar rangos si se envían
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

    const updated = await updateQAEvaluation(supabase, id, {
      excelencia: body.excelencia,
      soft_skills: body.soft_skills,
      comentarios: body.comentarios,
    });

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        action: "UPDATE",
        entity_type: "QA_EVALUATION",
        entity_id: id,
        entity_name: `QA Evaluation ${existing.start_date} - ${existing.end_date}`,
        old_values: existing,
        new_values: updated,
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.error("Error en audit log PATCH QA evaluation:", auditErr);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error en PATCH /api/qa-evaluations/[id]:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, isLead, supabase } = authCtx;

    if (!isLead) {
      return NextResponse.json(
        { error: "No tienes permisos para eliminar evaluaciones de QA" },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Obtener datos antes de borrar para el audit log
    const { data: existing, error: fetchError } = await supabase
      .from("qa_evaluations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        { error: "Error al obtener evaluación" },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: "Evaluación no encontrada" },
        { status: 404 },
      );
    }

    await deleteQAEvaluation(supabase, id);

    // Audit log
    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        action: "DELETE",
        entity_type: "QA_EVALUATION",
        entity_id: id,
        entity_name: `QA Evaluation ${existing.start_date} - ${existing.end_date}`,
        old_values: existing,
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.error("Error en audit log DELETE QA evaluation:", auditErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en DELETE /api/qa-evaluations/[id]:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
