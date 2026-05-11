import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function GET(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = authCtx;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  let query = supabase
    .from("timing_categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching timing_categories:", error);
    return NextResponse.json(
      { error: "Error al obtener categorías de tiempo" },
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

  // Validaciones
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "El nombre es requerido" },
      { status: 400 },
    );
  }
  if (
    typeof body.display_order !== "number" ||
    !Number.isInteger(body.display_order) ||
    body.display_order < 1
  ) {
    return NextResponse.json(
      { error: "El orden debe ser un entero positivo (≥ 1)" },
      { status: 400 },
    );
  }
  if (body.hex_color !== undefined && !HEX_REGEX.test(body.hex_color)) {
    return NextResponse.json(
      { error: "hex_color debe tener formato #RRGGBB" },
      { status: 400 },
    );
  }

  const name = body.name.trim();

  // Verificar duplicado (case-insensitive, activos)
  const { data: existing } = await supabase
    .from("timing_categories")
    .select("id")
    .ilike("name", name)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una categoría activa con ese nombre" },
      { status: 409 },
    );
  }

  const slug = slugify(name);

  // Validar que el slug resultante no sea vacío (p.ej. nombres con solo símbolos: "!!!")
  if (!slug || slug.trim().length === 0) {
    return NextResponse.json(
      {
        error:
          "El nombre no produce un identificador válido. Usa letras o números en el nombre.",
      },
      { status: 400 },
    );
  }

  // Verificar colisión de slug (pueden existir nombres distintos que producen el mismo slug)
  const { data: slugConflict } = await supabase
    .from("timing_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (slugConflict) {
    return NextResponse.json(
      {
        error:
          "Ya existe una categoría con un nombre similar. Intenta con un nombre más distintivo.",
      },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("timing_categories")
    .insert({
      slug,
      name,
      hex_color: body.hex_color?.trim() ?? "#6B7280",
      display_order: body.display_order,
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating timing_category:", error);
    return NextResponse.json(
      { error: "Error al crear la categoría de tiempo" },
      { status: 500 },
    );
  }
  return NextResponse.json(data, { status: 201 });
}
