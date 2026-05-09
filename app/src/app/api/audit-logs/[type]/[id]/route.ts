import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    const { id, type } = await params;

    if (!["task", "report"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid entity type" },
        { status: 400 },
      );
    }

    // Map type to entity_type
    const entityType = type === "task" ? "TASK" : "REPORT";

    let query = supabase
      .from("audit_logs")
      .select("*")
      .eq("entity_id", id)
      .eq("entity_type", entityType);

    // No-admins solo pueden ver logs de sus propias acciones
    if (userRole !== "admin") {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query.order("timestamp", {
      ascending: false,
    });

    if (error) {
      console.error("Error fetching audit history:", error);
      return NextResponse.json(
        { error: "Error al obtener historial de auditoría" },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: data || [] }, { status: 200 });
  } catch (error) {
    console.error("Error fetching audit history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
