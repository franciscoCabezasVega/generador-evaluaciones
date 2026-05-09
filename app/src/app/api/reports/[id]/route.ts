import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Obtener usuario, rol y cliente autenticado en una sola llamada
    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, role: userRole, supabase } = authCtx;

    if (!userRole || !["admin", "reportero"].includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to delete reports" },
        { status: 403 },
      );
    }

    // Obtener el reporte antes de eliminarlo
    const { data: report, error: getError } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();

    if (getError || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // Verificar propiedad: reporteros solo pueden eliminar sus propios reportes
    if (userRole !== "admin" && report.created_by !== user.id) {
      return NextResponse.json(
        { error: "You can only delete your own reports" },
        { status: 403 },
      );
    }

    // Eliminar el reporte
    const { error: deleteError } = await supabase
      .from("reports")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Error deleting report" },
        { status: 500 },
      );
    }

    // Register audit log for deletion
    const userEmail = user.email || "unknown";
    const reportName = `${report.squad} - ${report.month}/${report.year} v${report.version}`;

    try {
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        user_email: userEmail,
        action: "DELETE",
        entity_type: "REPORT",
        entity_id: id,
        entity_name: reportName,
        timestamp: new Date().toISOString(),
      });
    } catch (auditError) {
      console.error("Error logging audit action:", auditError);
      // No fallar la solicitud si el audit falla
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/reports/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const authCtx = await getAuthContext(request);
    if (!authCtx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { supabase } = authCtx;

    // Obtener el reporte
    const { data: report, error } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error in GET /api/reports/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
