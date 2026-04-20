import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('products')
    .update({ status: 'sold', sold_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return fail(error.message, 500);
  if (!data) return fail('Not found', 404);
  return ok(data);
};
