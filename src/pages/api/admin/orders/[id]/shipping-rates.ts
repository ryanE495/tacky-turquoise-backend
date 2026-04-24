import type { APIRoute } from 'astro';
import { getAvailableRatesForOrder } from '~/lib/shippo-labels';
import { isUuid } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id || !isUuid(id)) return fail('Invalid order id', 400);

  const result = await getAvailableRatesForOrder(id);
  if (!result) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'rates_unavailable',
          message:
            "Shippo couldn't return rates for this order. Verify the shipping address and shipping origin settings.",
        },
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  return ok(result);
};
