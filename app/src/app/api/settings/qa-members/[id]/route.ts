import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { syncHolidaysAsOOO } from "@/lib/services/workCalendarService";

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

// Timezone derivada del país + ciudad
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
  const map = TIMEZONE_MAP[country_code];
  if (!map) return "UTC";
  if (city && map[city]) return map[city];
  return map.default;
}

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
      .from("qa_members")
      .select("id")
      .ilike("name", name)
      .neq("id", id)
      .single();
    if (existing) {
      return NextResponse.json(
        { error: "Ya existe un miembro QA con ese nombre" },
        { status: 409 },
      );
    }
    updates.name = name;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  if (body.clickup_user_id !== undefined) {
    updates.clickup_user_id =
      typeof body.clickup_user_id === "string" && body.clickup_user_id.trim()
        ? body.clickup_user_id.trim()
        : null;
  }

  // ── Campos de calendario laboral ─────────────────────────────────────────

  if (body.country_code !== undefined) {
    // Normalizar string vacío a null (usuario limpió el campo)
    const cc =
      typeof body.country_code === "string" && !body.country_code.trim()
        ? null
        : body.country_code;
    if (cc !== null && !COUNTRY_CODE_RE.test(String(cc))) {
      return NextResponse.json(
        {
          error:
            "country_code debe ser un código ISO 3166-1 de 2 letras mayúsculas (ej: CO)",
        },
        { status: 400 },
      );
    }
    updates.country_code = cc;
  }

  // city: texto libre (ej: "Cartagena", "Monterrey")
  if (body.city !== undefined) {
    updates.city =
      typeof body.city === "string" && body.city.trim()
        ? body.city.trim()
        : null;
  }

  // timezone: derivada automáticamente del país + ciudad
  const finalCountryCode = (updates.country_code ?? body.country_code) as
    | string
    | null;
  const finalCity = (updates.city ?? body.city) as string | null;
  if (finalCountryCode) {
    updates.timezone = deriveTimezone(finalCountryCode, finalCity);
  } else if (updates.country_code !== undefined) {
    // country_code fue explícitamente limpiado → limpiar timezone también
    updates.timezone = null;
  }

  const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
  if (body.work_start_time !== undefined) {
    if (
      typeof body.work_start_time === "string" &&
      body.work_start_time.trim()
    ) {
      if (!TIME_RE.test(body.work_start_time.trim())) {
        return NextResponse.json(
          { error: "work_start_time debe tener formato HH:MM o HH:MM:SS" },
          { status: 400 },
        );
      }
      updates.work_start_time = body.work_start_time.trim();
    } else {
      updates.work_start_time = null;
    }
  }
  if (body.work_end_time !== undefined) {
    if (typeof body.work_end_time === "string" && body.work_end_time.trim()) {
      if (!TIME_RE.test(body.work_end_time.trim())) {
        return NextResponse.json(
          { error: "work_end_time debe tener formato HH:MM o HH:MM:SS" },
          { status: 400 },
        );
      }
      updates.work_end_time = body.work_end_time.trim();
    } else {
      updates.work_end_time = null;
    }
  }

  if (body.lunch_hours !== undefined) {
    const lh = Number(body.lunch_hours);
    if (isNaN(lh) || lh < 0 || lh > 4) {
      return NextResponse.json(
        { error: "lunch_hours debe ser un número entre 0 y 4" },
        { status: 400 },
      );
    }
    updates.lunch_hours = lh;
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
    updates.work_days = wd;
  }

  if (body.is_ooo !== undefined) {
    // Exigir boolean estricto — Boolean("false") = true (erróneo si llega string)
    if (typeof body.is_ooo !== "boolean") {
      return NextResponse.json(
        { error: "is_ooo debe ser un boolean" },
        { status: 400 },
      );
    }
    updates.is_ooo = body.is_ooo;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No hay campos para actualizar" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("qa_members")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating QA member:", error);
    return NextResponse.json(
      { error: "Error al actualizar miembro QA" },
      { status: 500 },
    );
  }

  // Si cambió el país, re-sincronizar festivos para el año en curso
  const cc = data.country_code as string | null;
  if (cc && (body.country_code !== undefined || body.city !== undefined)) {
    const year = new Date().getFullYear();
    syncHolidaysAsOOO(id, cc, year).catch((err) =>
      console.error("[PATCH qa-members] syncHolidaysAsOOO failed:", err),
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

  const { data: member } = await supabase
    .from("qa_members")
    .select("name")
    .eq("id", id)
    .single();

  if (!member) {
    return NextResponse.json(
      { error: "Miembro QA no encontrado" },
      { status: 404 },
    );
  }

  const { count } = await supabase
    .from("task_qa")
    .select("id", { count: "exact", head: true })
    .eq("qa_name", member.name);

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: hay ${count} tarea(s) asignadas a "${member.name}". Desactívalo en su lugar.`,
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("qa_members").delete().eq("id", id);
  if (error) {
    console.error("Error deleting QA member:", error);
    return NextResponse.json(
      { error: "Error al eliminar miembro QA" },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true });
}
