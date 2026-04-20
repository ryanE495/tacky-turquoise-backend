import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';
import { isValidEmail, listAdminUsers } from '~/lib/users';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const supabase = createSupabaseAdminClient();
  try {
    const users = await listAdminUsers(supabase);
    return ok(users);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayNameRaw = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const display_name = displayNameRaw === '' ? null : displayNameRaw;
  const passwordRaw = typeof body.password === 'string' ? body.password : '';
  const usePassword = passwordRaw.length > 0;

  if (!email) return fail('Email is required', 400);
  if (!isValidEmail(email)) return fail('Invalid email', 400);
  if (usePassword && passwordRaw.length < 8) {
    return fail('Password must be at least 8 characters', 400);
  }

  const supabase = createSupabaseAdminClient();

  let createdUser: { id: string; email: string | null; email_confirmed_at: string | null; last_sign_in_at: string | null; created_at: string } | null = null;

  if (usePassword) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: passwordRaw,
      email_confirm: true,
      user_metadata: display_name ? { display_name } : undefined,
    });
    if (error) return fail(error.message, 400);
    if (!data.user) return fail('User creation returned no user', 500);
    createdUser = {
      id: data.user.id,
      email: data.user.email ?? email,
      email_confirmed_at: data.user.email_confirmed_at ?? null,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
      created_at: data.user.created_at,
    };
  } else {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: display_name ? { display_name } : undefined,
    });
    if (error) return fail(error.message, 400);
    if (!data?.user) return fail('Invite returned no user', 500);
    createdUser = {
      id: data.user.id,
      email: data.user.email ?? email,
      email_confirmed_at: data.user.email_confirmed_at ?? null,
      last_sign_in_at: data.user.last_sign_in_at ?? null,
      created_at: data.user.created_at,
    };
  }

  if (display_name) {
    await supabase.from('profiles').upsert({ id: createdUser.id, display_name });
  }

  return ok({ ...createdUser, display_name }, { status: 201 });
};
