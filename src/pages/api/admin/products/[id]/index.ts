import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateProductInput } from '~/lib/validate-product';
import { ok, fail } from '~/lib/api';

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

  if (Object.prototype.hasOwnProperty.call(body, 'piece_id')) {
    return fail('piece_id is read-only', 400);
  }

  const supabase = createSupabaseAdminClient();
  const result = await validateProductInput(body, supabase, id);
  if (!result.ok) return fail(result.error, 400);

  const patch: Record<string, unknown> = { ...result.value };
  if (result.value.status === 'sold') {
    patch.sold_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return fail(error.message, 500);
  if (!data) return fail('Not found', 404);
  return ok(data);
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id) return fail('Missing id', 400);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('products')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return fail(error.message, 500);
  if (!data) return fail('Not found', 404);
  return ok(data);
};
