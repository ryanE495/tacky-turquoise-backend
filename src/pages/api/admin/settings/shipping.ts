import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { US_STATES } from '~/lib/orders';
import { ok, fail } from '~/lib/api';

export const prerender = false;

const US_STATE_SET = new Set(US_STATES.map((s) => s.value));
const ZIP_RE = /^\d{5}(-\d{4})?$/;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('shipping_settings')
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

  const name = opt(body.ship_from_name);
  if (name !== undefined) {
    if (!name) return fail('Name is required', 400);
    patch.ship_from_name = name;
  }
  const street1 = opt(body.ship_from_street1);
  if (street1 !== undefined) {
    if (!street1) return fail('Street address is required', 400);
    patch.ship_from_street1 = street1;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'ship_from_street2')) {
    patch.ship_from_street2 = opt(body.ship_from_street2) || null;
  }
  const city = opt(body.ship_from_city);
  if (city !== undefined) {
    if (!city) return fail('City is required', 400);
    patch.ship_from_city = city;
  }
  const state = opt(body.ship_from_state);
  if (state !== undefined) {
    if (!US_STATE_SET.has(state.toUpperCase())) return fail('Valid state is required', 400);
    patch.ship_from_state = state.toUpperCase();
  }
  const zip = opt(body.ship_from_zip);
  if (zip !== undefined) {
    if (!ZIP_RE.test(zip)) return fail('Valid ZIP code is required', 400);
    patch.ship_from_zip = zip;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'ship_from_phone')) {
    patch.ship_from_phone = opt(body.ship_from_phone) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'ship_from_email')) {
    patch.ship_from_email = opt(body.ship_from_email) || null;
  }

  const length = optNum(body.default_length_in);
  if (length !== undefined) {
    if (!(length > 0 && length < 48)) return fail('Length must be between 0 and 48 inches', 400);
    patch.default_length_in = length;
  }
  const width = optNum(body.default_width_in);
  if (width !== undefined) {
    if (!(width > 0 && width < 48)) return fail('Width must be between 0 and 48 inches', 400);
    patch.default_width_in = width;
  }
  const height = optNum(body.default_height_in);
  if (height !== undefined) {
    if (!(height > 0 && height < 48)) return fail('Height must be between 0 and 48 inches', 400);
    patch.default_height_in = height;
  }
  const weight = optNum(body.default_weight_oz);
  if (weight !== undefined) {
    if (!(weight > 0 && weight < 100)) return fail('Weight must be between 0 and 100 oz', 400);
    patch.default_weight_oz = weight;
  }

  if (Object.keys(patch).length === 0) return fail('No fields to update', 400);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('shipping_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();
  if (error) return fail(error.message, 500);
  return ok(data);
};

function opt(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function optNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}
