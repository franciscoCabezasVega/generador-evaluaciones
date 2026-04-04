import { createClient } from '@supabase/supabase-js';

/**
 * Global Teardown — runs once after all E2E tests complete.
 *
 * Deletes any tasks created during the test run that still have
 * the "E2E " prefix in their name. This keeps the database clean
 * without requiring individual tests to guarantee their own cleanup
 * (which can be skipped when a test fails mid-way).
 *
 * Uses the service_role key to bypass Row Level Security — safe
 * here because this only runs in controlled CI/dev environments.
 */
export default async function globalTeardown() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      '[teardown] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. ' +
        'Skipping E2E task cleanup.',
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('tasks')
      .select('id, name')
      .like('name', 'E2E %');

    if (fetchError) {
      console.warn('[teardown] Failed to fetch E2E tasks:', fetchError.message);
      return;
    }

    if (!tasks || tasks.length === 0) {
      console.log('[teardown] No E2E tasks to clean up.');
      return;
    }

    const ids = tasks.map((t: { id: string }) => t.id);
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.warn('[teardown] Failed to delete E2E tasks:', deleteError.message);
    } else {
      console.log(`[teardown] Cleaned up ${ids.length} E2E task(s).`);
    }
  } catch (err) {
    console.warn('[teardown] Unexpected error during cleanup:', err);
  }
}
