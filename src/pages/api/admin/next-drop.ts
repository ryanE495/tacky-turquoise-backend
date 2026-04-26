import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drop_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('Not found', 404);
  return ok(data);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const patch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    patch.enabled = !!body.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    patch.name = strOrNull(body.name);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'drops_at')) {
    if (body.drops_at === null || body.drops_at === '') {
      patch.drops_at = null;
    } else if (typeof body.drops_at === 'string') {
      const d = new Date(body.drops_at);
      if (Number.isNaN(d.getTime())) return fail('drops_at is not a valid date', 400);
      patch.drops_at = d.toISOString();
    } else {
      return fail('drops_at must be a string or null', 400);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    patch.location = strOrNull(body.location);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'shop_url')) {
    patch.shop_url = strOrNull(body.shop_url);
  }

  if (Object.keys(patch).length === 0) return fail('No fields to update', 400);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drop_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
};

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.trim() : String(v).trim();
  return s === '' ? null : s;
}
