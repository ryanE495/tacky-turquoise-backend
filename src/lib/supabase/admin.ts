// SERVER-ONLY. Never import this from a file that ships to the browser.
// Uses the service role key to bypass RLS for trusted admin mutations.
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
