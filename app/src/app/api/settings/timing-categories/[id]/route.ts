import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;
const PROTECTED_FIELDS = ["slug"];

export async function PATCH(
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
      { error: "Solo administradores pueden gestionar catálogos" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await request.json();

  // Bloquear campos protegidos
  for (const field of PROTECTED_FIELDS) {
    if (field in body) {
      return NextResponse.json(
        { error: `El campo "${field}" no puede modificarse` },
        { status: 400 },
      );
    }
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "El nombre no puede estar vacío" },
        { status: 400 },
      );
    }
    const name = body.name.trim();
    // Verificar duplicado (excluir el propio)
    const { data: existing } = await supabase
      .from("timing_categories")
      .select("id")
      .ilike("name", name)
      .eq("is_active", true)
      .neq("id", id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una categoría activa con ese nombre" },
        { status: 409 },
      );
    }
    updates.name = name;
  }

  if (body.hex_color !== undefined) {
    if (!HEX_REGEX.test(body.hex_color)) {
      return NextResponse.json(
        { error: "hex_color debe tener formato #RRGGBB" },
        { status: 400 },
      );
    }
    updates.hex_color = body.hex_color.trim();
  }

  if (body.display_order !== undefined) {
    const order = Number(body.display_order);
    if (!Number.isInteger(order) || order < 1) {
      return NextResponse.json(
        { error: "El orden debe ser un entero positivo (≥ 1)" },
        { status: 400 },
      );
    }
    updates.display_order = order;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  // is_system es un campo protegido: no se puede cambiar desde el cliente
  // para evitar desproteger categorías seed usadas en métricas

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No hay campos válidos para actualizar" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("timing_categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating timing_category:", error);
    return NextResponse.json(
      { error: "Error al actualizar la categoría de tiempo" },
      { status: 500 },
    );
  }
  return NextResponse.json(data);
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
      { error: "Solo administradores pueden gestionar catálogos" },
      { status: 403 },
    );
  }

  const { id } = await params;

  // Verificar existencia
  const { data: category } = await supabase
    .from("timing_categories")
    .select("name, is_system")
    .eq("id", id)
    .single();

  if (!category) {
    return NextResponse.json(
      { error: "Categoría no encontrada" },
      { status: 404 },
    );
  }

  // Categorías del sistema: no eliminables
  if (category.is_system) {
    return NextResponse.json(
      {
        error:
          "Las categorías del sistema no se pueden eliminar; desactívalas en su lugar.",
      },
      { status: 403 },
    );
  }

  // Verificar uso en timing_qa_category_hours
  const { count, error: countError } = await supabase
    .from("timing_qa_category_hours")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (countError) {
    console.error("Error checking category usage:", countError);
    return NextResponse.json(
      { error: "Error al verificar el uso de la categoría" },
      { status: 500 },
    );
  }

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${count} registro(s) que usan esta categoría. Desactívala en su lugar.`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("timing_categories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting timing_category:", error);
    return NextResponse.json(
      { error: "Error al eliminar la categoría de tiempo" },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
