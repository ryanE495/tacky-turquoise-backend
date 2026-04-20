import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';
import { isValidEmail, getAdminUserById } from '~/lib/users';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email');
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, 'display_name');

  if (!hasEmail && !hasDisplayName) return fail('No fields to update', 400);

  const supabase = createSupabaseAdminClient();

  if (hasEmail) {
    if (id === locals.user.id) {
      return fail('Change your own email from your account settings, not here.', 400);
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) return fail('Invalid email', 400);
    const { error } = await supabase.auth.admin.updateUserById(id, { email });
    if (error) return fail(error.message, 400);
  }

  if (hasDisplayName) {
    const raw = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    const display_name = raw === '' ? null : raw;
    const { error } = await supabase.from('profiles').upsert({ id, display_name });
    if (error) return fail(error.message, 500);
  }

  const updated = await getAdminUserById(supabase, id);
  if (!updated) return fail('Not found', 404);
  return ok(updated);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  if (id === locals.user.id) {
    return fail('Cannot delete yourself', 400);
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return fail(error.message, 400);
  return ok({ id });
};
