import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, getServiceClient } from "@/lib/auth";
import { encryptText } from "@/lib/encryption";

/**
 * GET /api/settings/clickup
 * Returns whether a ClickUp API key is configured and when it was last updated.
 * Accessible by admin and gestor roles.
 */
export async function GET(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = authCtx;
  if (!role || !["admin", "gestor"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { data, error } = await supabase
    .from("clickup_settings")
    .select("id, updated_at")
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "No rows returned" — expected when no key is set
    console.error("Error fetching ClickUp settings:", error);
    return NextResponse.json(
      { error: "Error al obtener configuración" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    hasKey: !!data,
    updatedAt: data?.updated_at ?? null,
  });
}

/**
 * POST /api/settings/clickup
 * Encrypt and store a ClickUp API key. Overwrites any existing key.
 * Admin-only.
 *
 * Body: { apiKey: string }
 */
export async function POST(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = authCtx;
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Solo administradores pueden configurar la integración ClickUp" },
      { status: 403 },
    );
  }

  let body: { apiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (
    !body.apiKey ||
    typeof body.apiKey !== "string" ||
    !body.apiKey.trim()
  ) {
    return NextResponse.json(
      { error: "apiKey es requerido" },
      { status: 400 },
    );
  }

  let encrypted: { ciphertext: string; iv: string };
  try {
    encrypted = await encryptText(body.apiKey.trim());
  } catch (err) {
    console.error("Encryption error:", err);
    return NextResponse.json(
      { error: "Error al cifrar la clave. Verifica la variable CLICKUP_ENCRYPTION_KEY." },
      { status: 500 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Delete existing row then insert — ensures single-row invariant
  await supabase.from("clickup_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { data, error } = await supabase
    .from("clickup_settings")
    .insert({ encrypted_key: encrypted.ciphertext, key_iv: encrypted.iv })
    .select("id, updated_at")
    .single();

  if (error) {
    console.error("Error storing ClickUp key:", error);
    return NextResponse.json(
      { error: "Error al guardar la clave" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, updatedAt: data.updated_at }, { status: 201 });
}

/**
 * DELETE /api/settings/clickup
 * Remove the ClickUp API key and disable all task syncs.
 * Admin-only.
 */
export async function DELETE(request: NextRequest) {
  const authCtx = await getAuthContext(request);
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = authCtx;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Disable all syncs first
  await supabase
    .from("clickup_task_sync")
    .update({ sync_enabled: false })
    .eq("sync_enabled", true);

  // Delete the key
  const { error } = await supabase
    .from("clickup_settings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("Error deleting ClickUp key:", error);
    return NextResponse.json(
      { error: "Error al eliminar la clave" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
