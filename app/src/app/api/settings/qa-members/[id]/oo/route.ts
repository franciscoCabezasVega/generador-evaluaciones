import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

// GET /api/settings/qa-members/[id]/oo   → lista de períodos OOO
// POST /api/settings/qa-members/[id]/oo  → crear período
// DELETE /api/settings/qa-members/[id]/oo?ooId=  → eliminar período

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = authCtx;
  const { id } = await params;

  const { data, error } = await supabase
    .from("qa_member_oo")
    .select("id, date_from, date_to, reason, source, created_at")
    .eq("qa_id", id)
    .order("date_from", { ascending: true });

  if (error) {
    console.error("Error fetching OOO periods:", error);
    return NextResponse.json(
      { error: "Error al obtener períodos OOO" },
      { status: 500 },
    );
  }
  return NextResponse.json(data ?? []);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { role, supabase } = authCtx;

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden gestionar períodos OOO" },
      { status: 403 },
    );
  }

  const { id: qa_id } = await params;
  const body = await request.json();

  // Validar campos requeridos
  if (
    !body.date_from ||
    typeof body.date_from !== "string" ||
    !body.date_from.match(/^\d{4}-\d{2}-\d{2}$/)
  ) {
    return NextResponse.json(
      { error: "date_from es requerido y debe tener formato YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (
    !body.date_to ||
    typeof body.date_to !== "string" ||
    !body.date_to.match(/^\d{4}-\d{2}-\d{2}$/)
  ) {
    return NextResponse.json(
      { error: "date_to es requerido y debe tener formato YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (body.date_to < body.date_from) {
    return NextResponse.json(
      { error: "date_to no puede ser anterior a date_from" },
      { status: 400 },
    );
  }

  // Verificar que el QA existe
  const { data: qa } = await supabase
    .from("qa_members")
    .select("id")
    .eq("id", qa_id)
    .single();

  if (!qa) {
    return NextResponse.json(
      { error: "Miembro QA no encontrado" },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("qa_member_oo")
    .insert({
      qa_id,
      date_from: body.date_from,
      date_to: body.date_to,
      // Normalizar string vacío a null para evitar guardar "" en BD
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim()
          : null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating OOO period:", error);
    // Código 23P01 = exclusion_violation (solapamiento de rango)
    if (error.code === "23P01") {
      return NextResponse.json(
        {
          error:
            "El rango seleccionado se solapa con otro período OOO existente",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Error al crear período OOO" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { role, supabase } = authCtx;

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden gestionar períodos OOO" },
      { status: 403 },
    );
  }

  const { id: qa_id } = await params;
  const { searchParams } = new URL(request.url);
  const ooId = searchParams.get("ooId");

  if (!ooId) {
    return NextResponse.json(
      { error: "El parámetro ooId es requerido" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("qa_member_oo")
    .delete()
    .eq("id", ooId)
    .eq("qa_id", qa_id); // doble condición por seguridad

  if (error) {
    console.error("Error deleting OOO period:", error);
    return NextResponse.json(
      { error: "Error al eliminar período OOO" },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
