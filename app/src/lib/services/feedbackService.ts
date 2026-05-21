import "server-only";
import { createClient, type LockFunc } from "@supabase/supabase-js";
import { CreateFeedbackInput } from "@/lib/types";

// No-op lock: este cliente server-side usa service role key y nunca persiste
// sesión. Sin esto, Supabase adquiere el processLock compartido durante la
// inicialización, causando contención bajo carga.
const noOpLock: LockFunc = (_name, _acquireTimeout, fn) => fn();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "[feedbackService] Variables de entorno requeridas no configuradas: " +
      (!supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL " : "") +
      (!supabaseServiceKey ? "SUPABASE_SERVICE_ROLE_KEY" : ""),
  );
}

// Usar Service Role Key para operaciones server-side (no depender de anon key sin contexto de RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false, lock: noOpLock },
});

export async function createFeedbackReport(input: CreateFeedbackInput) {
  try {
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
