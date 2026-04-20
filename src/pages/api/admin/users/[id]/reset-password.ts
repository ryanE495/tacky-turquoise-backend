import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals, url }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user?.email) return fail('User not found', 404);

  const redirectTo = `${url.origin}/admin/set-password`;
  const { error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: data.user.email,
    options: { redirectTo },
  });
  if (linkErr) return fail(linkErr.message, 400);

  return ok({ id, email: data.user.email });
};
