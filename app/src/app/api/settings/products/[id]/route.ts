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
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .ilike("name", name)
      .neq("id", id)
      .single();
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un producto con ese nombre" },
        { status: 409 },
      );
    }
    updates.name = name;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Error al actualizar producto" },
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

  // Obtener el nombre del producto para verificar dependencias en tasks
  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", id)
    .single();

  if (!product) {
    return NextResponse.json(
      { error: "Producto no encontrado" },
      { status: 404 },
    );
  }

  // Verificar dependencias en tasks
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("product_type", product.name);

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${count} tarea(s) que usan el producto "${product.name}". Desactívalo en su lugar.`,
      },
      { status: 409 },
    );
  }

  // Verificar dependencias en squads
  const { count: squadCount } = await supabase
    .from("squads")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if (squadCount && squadCount > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${squadCount} squad(s) asociados a este producto. Elimínalos primero.`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Error al eliminar producto" },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
