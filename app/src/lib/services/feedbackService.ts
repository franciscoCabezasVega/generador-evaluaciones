import "server-only";
import { createClient, type LockFunc } from "@supabase/supabase-js";
import { CreateFeedbackInput } from "@/lib/types";

// No-op lock: este cliente server-side usa service role key y nunca persiste
// sesión. Sin esto, Supabase adquiere el processLock compartido durante la
// inicialización, causando contención bajo carga.
const noOpLock: LockFunc = (_name, _acquireTimeout, fn) => fn();

// Lazy getter que sigue el mismo patrón que getServiceClient() en auth.ts:
// retorna null si faltan env vars en lugar de lanzar a nivel de módulo,
// evitando que un deploy misconfig tumbe el runtime completo al cargar el handler.
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[feedbackService] Variables de entorno requeridas no configuradas: " +
        (!url ? "NEXT_PUBLIC_SUPABASE_URL " : "") +
        (!key ? "SUPABASE_SERVICE_ROLE_KEY" : ""),
    );
    return null;
  }
  // Usar Service Role Key para operaciones server-side (no depender de anon key sin contexto de RLS)
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, lock: noOpLock },
  });
}

export async function createFeedbackReport(input: CreateFeedbackInput) {
  const supabase = getClient();
  try {
    if (!supabase) {
      throw new Error(
        "[feedbackService] Variables de entorno requeridas no configuradas",
      );
    }
    // Create feedback report record
    const { data: feedbackData, error: feedbackError } = await supabase
      .from("feedback_reports")
      .insert({
        type: input.type,
        description: input.description,
        evidence_url: input.evidence_url || null,
        status: "new",
      })
      .select(
        "id, type, description, evidence_url, status, created_at, updated_at",
      )
      .single();

    if (feedbackError) {
      throw new Error(
        `Error creating feedback report: ${feedbackError.message}`,
      );
    }

    return {
      success: true,
      feedbackId: feedbackData.id,
      data: feedbackData,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(errorMessage);
  }
}
