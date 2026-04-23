// Public endpoint: given a cart + shipping address, returns a live Shippo
// USPS Ground Advantage rate. Re-validates cart availability at the same time
// so a single call can drive both the shipping line and the "still in stock"
// check on /checkout.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateCart } from '~/lib/cart-validate';
import { getUspsGroundAdvantageRate, loadShippingSettings } from '~/lib/shippo';
import { ok, fail } from '~/lib/api';

export const prerender = false;

const ZIP_RE = /^\d{5}(-\d{4})?$/;

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const productIds: string[] = Array.isArray(body.product_ids)
    ? body.product_ids.filter((v: unknown) => typeof v === 'string')
    : [];
  if (productIds.length === 0) {
    return jsonErr({ code: 'empty_cart', message: 'Cart is empty' }, 400);
  }

  const addr = body.shipping_address ?? {};
  const to = {
    name: str(addr.name).trim(),
    street1: str(addr.street1).trim(),
    street2: str(addr.street2).trim() || undefined,
    city: str(addr.city).trim(),
    state: str(addr.state).trim().toUpperCase(),
    zip: str(addr.zip).trim(),
    country: (str(addr.country).trim() || 'US').toUpperCase(),
  };

  if (to.country !== 'US') {
    return jsonErr(
      { code: 'unsupported_country', message: 'Shipping is US-only at this time.' },
      400,
    );
  }
  if (!to.street1 || !to.city || !to.state || !ZIP_RE.test(to.zip)) {
    return jsonErr(
      { code: 'invalid_address', message: 'Enter a full US address to calculate shipping.' },
      400,
    );
  }
  if (!to.name) to.name = 'Recipient';

  const supabase = createSupabaseAdminClient();

  try {
    const validation = await validateCart(supabase, productIds);
    if (validation.unavailable.length > 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'items_unavailable', unavailable: validation.unavailable },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    }
    if (validation.available.length === 0) {
      return jsonErr({ code: 'empty_cart', message: 'Cart is empty' }, 400);
    }

    const settings = await loadShippingSettings(supabase);
    if (!settings) {
      return jsonErr(
        { code: 'shipping_not_configured', message: 'Shipping origin is not configured.' },
        500,
      );
    }

    const rate = await getUspsGroundAdvantageRate({
      settings,
      to,
      itemCount: validation.available.length,
    });
    if (!rate) {
      return jsonErr(
        {
          code: 'no_rates_available',
          message:
            "We couldn't calculate shipping to that address. Please verify your address or contact support.",
        },
        400,
      );
    }

    return ok(rate);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
};

function jsonErr(error: { code: string; message: string }, status: number) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
