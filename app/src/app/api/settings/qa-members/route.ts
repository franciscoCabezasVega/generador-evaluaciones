import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { syncHolidaysAsOOO } from "@/lib/services/workCalendarService";

// Regex para ISO 3166-1 alpha-2 (dos letras mayúsculas)
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

// Timezone derivada automáticamente del país + ciudad (el usuario no la ingresa)
const TIMEZONE_MAP: Record<string, Record<string, string>> = {
  CO: { default: "America/Bogota" },
  EC: { default: "America/Guayaquil" },
  MX: {
    default: "America/Mexico_City",
    Monterrey: "America/Monterrey",
    Cancún: "America/Cancun",
  },
};

function deriveTimezone(country_code: string, city?: string | null): string {
  const countryMap = TIMEZONE_MAP[country_code];
  if (!countryMap) return "UTC";
  if (city && countryMap[city]) return countryMap[city];
  return countryMap.default;
}

export async function GET(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase } = authCtx;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  let query = supabase.from("qa_members").select("*").order("name");
  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching QA members:", error);
    return NextResponse.json(
      { error: "Error al obtener miembros QA" },
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
  const name = body.name.trim();

  // clickup_user_id es opcional (campo heredado, no se muestra en UI pero se conserva)
  const clickupUserId =
    body.clickup_user_id !== undefined
      ? typeof body.clickup_user_id === "string" && body.clickup_user_id.trim()
        ? body.clickup_user_id.trim()
        : null
      : undefined;

  // ── Campos de calendario laboral (todos opcionales) ───────────────────────
  const calendarFields: Record<string, unknown> = {};

  if (body.country_code !== undefined) {
    if (
      body.country_code !== null &&
      !COUNTRY_CODE_RE.test(String(body.country_code))
    ) {
      return NextResponse.json(
        {
          error:
            "country_code debe ser un código ISO 3166-1 de 2 letras mayúsculas (ej: CO)",
        },
        { status: 400 },
      );
    }
    calendarFields.country_code = body.country_code ?? null;
  }

  // city: valor libre (ej: "Cartagena", "Monterrey")
  if (body.city !== undefined) {
    calendarFields.city =
      typeof body.city === "string" && body.city.trim()
        ? body.city.trim()
        : null;
  }

  // timezone: derivada automáticamente del país + ciudad
  const finalCountryCode = (calendarFields.country_code ??
    body.country_code) as string | null;
  const finalCity = (calendarFields.city ?? body.city) as string | null;
  if (finalCountryCode) {
    calendarFields.timezone = deriveTimezone(finalCountryCode, finalCity);
  }

  if (body.work_start_time !== undefined)
    calendarFields.work_start_time = body.work_start_time ?? null;
  if (body.work_end_time !== undefined)
    calendarFields.work_end_time = body.work_end_time ?? null;

  if (body.lunch_hours !== undefined) {
    const lh = Number(body.lunch_hours);
    if (isNaN(lh) || lh < 0 || lh > 4) {
      return NextResponse.json(
        { error: "lunch_hours debe ser un número entre 0 y 4" },
        { status: 400 },
      );
    }
    calendarFields.lunch_hours = lh;
  }

  if (body.work_days !== undefined) {
    if (!Array.isArray(body.work_days)) {
      return NextResponse.json(
        { error: "work_days debe ser un arreglo de números" },
        { status: 400 },
      );
    }
    const wd = body.work_days as unknown[];
    if (
      wd.some(
        (d) => typeof d !== "number" || d < 1 || d > 7 || !Number.isInteger(d),
      )
    ) {
      return NextResponse.json(
        {
          error:
            "work_days solo puede contener enteros entre 1 (Lun) y 7 (Dom)",
        },
        { status: 400 },
      );
    }
    calendarFields.work_days = wd;
  }

  if (body.is_ooo !== undefined) {
    calendarFields.is_ooo = Boolean(body.is_ooo);
  }

  const { data: existing } = await supabase
    .from("qa_members")
    .select("id")
    .ilike("name", name)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un miembro QA con ese nombre" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("qa_members")
    .insert({
      name,
      ...(clickupUserId !== undefined
        ? { clickup_user_id: clickupUserId }
        : {}),
      ...calendarFields,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating QA member:", error);
    return NextResponse.json(
      { error: "Error al crear miembro QA" },
      { status: 500 },
    );
  }

  // Sync festivos como OOO para el año en curso (fire-and-forget, no bloquea respuesta)
  const cc = data.country_code as string | null;
  if (cc) {
    const year = new Date().getFullYear();
    syncHolidaysAsOOO(data.id as string, cc, year).catch((err) =>
      console.error("[POST qa-members] syncHolidaysAsOOO failed:", err),
    );
  }

  return NextResponse.json(data, { status: 201 });
}
