import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = authCtx;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  let query = supabase.from("complexities").select("*").order("display_order");
  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching complexities:", error);
    return NextResponse.json(
      { error: "Error al obtener complejidades" },
      { status: 500 },
    );
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "El nombre es requerido" },
      { status: 400 },
    );
  }
  if (typeof body.display_order !== "number") {
    return NextResponse.json(
      { error: "El orden de visualización es requerido" },
      { status: 400 },
    );
  }

  const name = body.name.trim();
  const { data: existing } = await supabase
    .from("complexities")
    .select("id")
    .ilike("name", name)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una complejidad con ese nombre" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("complexities")
    .insert({
      name,
      label: body.label?.trim() ?? "",
      min_hours: body.min_hours ?? 0,
      max_hours: body.max_hours ?? 0,
      display_order: body.display_order,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating complexity:", error);
    return NextResponse.json(
      { error: "Error al crear complejidad" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
