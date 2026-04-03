import { createClient } from '@supabase/supabase-js';
import { CreateFeedbackInput } from '@/lib/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Usar Service Role Key para operaciones server-side (no depender de anon key sin contexto de RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function createFeedbackReport(input: CreateFeedbackInput) {
  try {
    // Create feedback report record
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('feedback_reports')
      .insert({
        type: input.type,
        description: input.description,
        evidence_url: input.evidence_url || null,
        status: 'new',
      })
      .select('id, type, description, evidence_url, status, created_at, updated_at')
      .single();

    if (feedbackError) {
      throw new Error(`Error creating feedback report: ${feedbackError.message}`);
    }

    return {
      success: true,
      feedbackId: feedbackData.id,
      data: feedbackData,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(errorMessage);
  }
}
