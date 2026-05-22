import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, getServiceClient } from "@/lib/auth";

/**
 * POST /api/admin/holidays/refresh
 *
 * Fuerza la re-descarga de festivos desde Nager.Date para un país y año dados.
 * Útil para refrescar datos stale o cargar un país nuevo.
 *
 * Body: { country_code: string; year: number }
 * Solo accesible por admins.
 */
export async function POST(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { role } = authCtx;

  if (role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden forzar refresco de festivos" },
      { status: 403 },
    );
  }

  const body = await request.json();

  const countryCode = String(body.country_code ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return NextResponse.json(
      {
        error: "country_code debe ser un código ISO 3166-1 alpha-2 (2 letras)",
      },
      { status: 400 },
    );
  }

  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return NextResponse.json(
      { error: "year debe ser un entero entre 2020 y 2100" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service client no disponible" },
      { status: 503 },
    );
  }

  // 1. Eliminar registros existentes para este país/año (para refrescar limpio)
  const { error: deleteError } = await supabase
    .from("holidays")
    .delete()
    .eq("country_code", countryCode)
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`);

  if (deleteError) {
    console.error(
      "[holidays/refresh] Error al limpiar feriados existentes:",
      deleteError,
    );
    return NextResponse.json(
      { error: "Error al limpiar feriados existentes" },
      { status: 500 },
    );
  }

  // 2. Obtener datos frescos desde Nager.Date
  // Timeout de 10 s: en serverless un upstream colgado consumiría todo el budget.
  let nagerRes: Response;
  try {
    nagerRes = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Nager.Date timeout o error de red: ${msg}` },
      { status: 504 },
    );
  }

  if (!nagerRes.ok) {
    if (nagerRes.status === 404) {
      return NextResponse.json(
        {
          error: `País ${countryCode} no soportado por Nager.Date, o el año ${year} no tiene datos`,
        },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: `Nager.Date respondió con ${nagerRes.status}` },
      { status: 502 },
    );
  }

  const nagerData = (await nagerRes.json()) as {
    date: string;
    localName: string;
  }[];

  if (nagerData.length === 0) {
    return NextResponse.json({
      inserted: 0,
      message: `Nager.Date no tiene festivos registrados para ${countryCode}/${year}`,
    });
  }

  // 3. Insertar registros frescos
  const { error: insertError } = await supabase.from("holidays").insert(
    nagerData.map((h) => ({
      country_code: countryCode,
      holiday_date: h.date,
      name: h.localName,
      source: "nager.date",
      fetched_at: new Date().toISOString(),
    })),
  );

  if (insertError) {
    console.error("Error inserting holidays:", insertError);
    return NextResponse.json(
      { error: "Error al guardar festivos en la base de datos" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    inserted: nagerData.length,
    country_code: countryCode,
    year,
    message: `${nagerData.length} festivos cargados para ${countryCode}/${year}`,
  });
}
