import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

/**
 * GET /api/tasks/check-link?link=<url>&excludeId=<taskId>
 *
 * Pre-flight check para saber si un link ya está en uso antes de hacer submit.
 * - 200 → link disponible
 * - 409 → link ya existe en otra tarea
 * - 401 → no autenticado
 */
export async function GET(request: NextRequest) {
  try {
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { supabase } = authCtx;

    const link = request.nextUrl.searchParams.get("link");
    const excludeId = request.nextUrl.searchParams.get("excludeId");

    if (!link?.trim()) {
      return NextResponse.json(
        { error: "El parámetro link es requerido" },
        { status: 400 },
      );
    }

    let query = supabase
      .from("tasks")
      .select("id")
      .eq("task_link", link.trim());

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("Error al verificar link duplicado:", error);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    if (data) {
      return NextResponse.json(
        {
          error:
            "Este link ya está en uso por otra tarea. Usa un link diferente.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (error) {
    console.error("Error en check-link:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
