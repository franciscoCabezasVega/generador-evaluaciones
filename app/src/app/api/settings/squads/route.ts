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
  const productId = searchParams.get("product_id");

  let query = supabase
    .from("squads")
    .select("*, product:products(id, name)")
    .order("name");

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }
  if (productId) {
    query = query.eq("product_id", productId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching squads:", error);
    return NextResponse.json(
      { error: "Error al obtener squads" },
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
  if (!body.product_id) {
    return NextResponse.json(
      { error: "El producto es requerido" },
      { status: 400 },
    );
  }

  const name = body.name.trim();

  const { data: existing } = await supabase
    .from("squads")
    .select("id")
    .eq("product_id", body.product_id)
    .ilike("name", name)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un squad con ese nombre en este producto" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("squads")
    .insert({ name, product_id: body.product_id })
    .select("*, product:products(id, name)")
    .single();

  if (error) {
    console.error("Error creating squad:", error);
    return NextResponse.json(
      { error: "Error al crear squad" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
