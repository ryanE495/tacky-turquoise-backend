import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return fail('User not found', 404);

  if (data.user.email_confirmed_at) {
    return fail('User has already accepted their invite', 400);
  }
  if (!data.user.email) return fail('User has no email', 400);

  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(data.user.email);
  if (inviteErr) return fail(inviteErr.message, 400);

  return ok({ id, email: data.user.email });
};
