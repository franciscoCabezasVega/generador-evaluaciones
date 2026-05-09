import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

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
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "El nombre no puede estar vacío" },
        { status: 400 },
      );
    }
    const name = body.name.trim();

    // Obtener product_id actual para validar unicidad dentro del mismo producto
    const productId = body.product_id;
    if (productId) {
      const { data: existing } = await supabase
        .from("squads")
        .select("id")
        .eq("product_id", productId)
        .ilike("name", name)
        .neq("id", id)
        .single();
      if (existing) {
        return NextResponse.json(
          { error: "Ya existe un squad con ese nombre en este producto" },
          { status: 409 },
        );
      }
    }
    updates.name = name;
  }

  if (body.product_id !== undefined) updates.product_id = body.product_id;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("squads")
    .update(updates)
    .eq("id", id)
    .select("*, product:products(id, name)")
    .single();

  if (error) {
    console.error("Error updating squad:", error);
    return NextResponse.json(
      { error: "Error al actualizar squad" },
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

  const { data: squad } = await supabase
    .from("squads")
    .select("name")
    .eq("id", id)
    .single();

  if (!squad) {
    return NextResponse.json({ error: "Squad no encontrado" }, { status: 404 });
  }

  const { count } = await supabase
    .from("task_squad")
    .select("id", { count: "exact", head: true })
    .eq("squad", squad.name);

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${count} tarea(s) que usan el squad "${squad.name}". Desactívalo en su lugar.`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("squads").delete().eq("id", id);
  if (error) {
    console.error("Error deleting squad:", error);
    return NextResponse.json(
      { error: "Error al eliminar squad" },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
