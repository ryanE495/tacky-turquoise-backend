// Temporary diagnostic. Delete before production.
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';

export const prerender = false;

const EMAIL = 'admin@tackyturquoise.local';
const PASSWORD = 'turquoise123';

export const GET: APIRoute = async () => {
  const out: Record<string, unknown> = {
    supabase_url: import.meta.env.PUBLIC_SUPABASE_URL,
    has_anon_key: Boolean(import.meta.env.PUBLIC_SUPABASE_ANON_KEY),
    has_service_role: Boolean(import.meta.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  try {
    const admin = createSupabaseAdminClient();
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      out.list_error = listErr.message;
    } else {
      out.user_count = list.users.length;
      out.users = list.users.map((u) => ({
        id: u.id,
        email: u.email,
        email_confirmed_at: u.email_confirmed_at,
        banned_until: (u as any).banned_until ?? null,
        created_at: u.created_at,
      }));
    }
  } catch (e) {
    out.admin_crash = (e as Error).message;
  }

  try {
    const anon = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await anon.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    });
    if (error) {
      out.signin_error = error.message;
      out.signin_status = (error as any).status ?? null;
    } else {
      out.signin_ok = true;
      out.signin_user_id = data.user?.id;
    }
  } catch (e) {
    out.signin_crash = (e as Error).message;
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};
