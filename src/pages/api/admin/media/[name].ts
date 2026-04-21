import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { MEDIA_BUCKET } from '~/lib/media';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const name = params.name;
  if (!name) return fail('Missing filename', 400);
  if (name.includes('/') || name.includes('..')) return fail('Invalid filename', 400);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([name]);
  if (error) return fail(error.message, 500);
  return ok({ name });
};
