// Public endpoint: no auth required. Takes a list of product IDs from the
// client cart, returns current availability + pricing. Never trust client-
// supplied prices — this is the source of truth at render time.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateCart } from '~/lib/cart-validate';
import { ok, fail } from '~/lib/api';
import { handleOptions, withCors } from '~/lib/cors';

export const prerender = false;

export const OPTIONS: APIRoute = ({ request }) => handleOptions(request);

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return withCors(request, fail('Invalid JSON body', 400));
  }

  const ids = Array.isArray(body.product_ids)
    ? (body.product_ids as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];

  try {
    const result = await validateCart(createSupabaseAdminClient(), ids);
    return withCors(request, ok(result));
  } catch (e) {
    return withCors(request, fail((e as Error).message, 500));
  }
};
