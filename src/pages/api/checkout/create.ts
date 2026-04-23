// Creates a local order row in `pending` status, then creates a Stripe
// Checkout Session pointing at it. Payment confirmation happens in the
// /api/webhooks/stripe handler — we do NOT mark products sold here.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateCart, fetchPrimaryImagePaths } from '~/lib/cart-validate';
import { getUspsGroundAdvantageRate, loadShippingSettings } from '~/lib/shippo';
import { publicImageUrl } from '~/lib/images';
import { getStripe } from '~/lib/stripe';
import { US_STATES } from '~/lib/orders';
import { ok, fail } from '~/lib/api';
import { handleOptions, withCors } from '~/lib/cors';

export const prerender = false;

const US_STATE_SET = new Set(US_STATES.map((s) => s.value));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

export const OPTIONS: APIRoute = ({ request }) => handleOptions(request);

export const POST: APIRoute = async ({ request, url }) => {
  const wrap = (r: Response) => withCors(request, r);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return wrap(fail('Invalid JSON body', 400));
  }

  const productIds: string[] = Array.isArray(body.product_ids)
    ? body.product_ids.filter((v: unknown) => typeof v === 'string')
    : [];
  if (productIds.length === 0) return wrap(fail('Cart is empty', 400));

  const customer = body.customer ?? {};
  const addr = body.shipping_address ?? {};
  const customerNotes =
    typeof body.customer_notes === 'string' && body.customer_notes.trim() !== ''
      ? body.customer_notes.trim()
      : null;

  const email = str(customer.email).trim().toLowerCase();
  const name = str(customer.name).trim();
  const phone = str(customer.phone).trim() || null;
  const line1 = str(addr.line1).trim();
  const line2 = str(addr.line2).trim() || null;
  const city = str(addr.city).trim();
  const state = str(addr.state).trim().toUpperCase();
  const postal = str(addr.postal_code).trim();
  const country = 'US';

  if (!EMAIL_RE.test(email)) return wrap(fail('Valid email is required', 400));
  if (!name) return wrap(fail('Name is required', 400));
  if (!line1) return wrap(fail('Address is required', 400));
  if (!city) return wrap(fail('City is required', 400));
  if (!US_STATE_SET.has(state)) return wrap(fail('Valid state is required', 400));
  if (!ZIP_RE.test(postal)) return wrap(fail('Valid ZIP code is required', 400));

  const clientSentRateId =
    typeof body.shipping_rate_id === 'string' ? body.shipping_rate_id : null;

  const supabase = createSupabaseAdminClient();

  // (1) Re-validate cart server-side. Never trust the client.
  let validation;
  try {
    validation = await validateCart(supabase, productIds);
  } catch (e) {
    return wrap(fail((e as Error).message, 500));
  }
  if (validation.unavailable.length > 0) {
    return wrap(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'items_unavailable', unavailable: validation.unavailable },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );
  }
  if (validation.available.length === 0) return wrap(fail('Cart is empty', 400));

  // (2) Re-fetch shipping rate (Shippo rates expire ~10 min; the client-sent
  //     id is only a debugging breadcrumb).
  const settings = await loadShippingSettings(supabase);
  if (!settings) {
    return wrap(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'shipping_not_configured', message: 'Shipping origin is not configured.' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    );
  }

  const freshRate = await getUspsGroundAdvantageRate({
    settings,
    to: {
      name,
      street1: line1,
      street2: line2 ?? undefined,
      city,
      state,
      zip: postal,
      country,
    },
    itemCount: validation.available.length,
  });

  if (!freshRate) {
    return wrap(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'shipping_unavailable',
            message: "Couldn't confirm shipping. Please try again.",
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
  }

  if (clientSentRateId && clientSentRateId !== freshRate.rate_id) {
    console.info(
      `checkout: shipping rate re-fetched (client=${clientSentRateId}, fresh=${freshRate.rate_id})`,
    );
  }

  // (3) Calculate totals from DB + fresh rate.
  const subtotalCents = validation.available.reduce((sum, p) => sum + p.price_cents, 0);
  const shippingCents = freshRate.amount_cents;
  const taxCents = 0; // Stripe Tax adds tax to amount_total at session time.
  const totalCents = subtotalCents + shippingCents;

  // (4) Insert order row.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      status: 'pending',
      customer_email: email,
      customer_name: name,
      customer_phone: phone,
      ship_to_name: name,
      ship_to_line1: line1,
      ship_to_line2: line2,
      ship_to_city: city,
      ship_to_state: state,
      ship_to_postal_code: postal,
      ship_to_country: country,
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      shippo_rate_id: freshRate.rate_id,
      shipping_service_level: freshRate.service_level,
      shipping_estimated_days: freshRate.estimated_days,
      customer_notes: customerNotes,
    })
    .select('id, order_number')
    .single();

  if (orderErr) return wrap(fail(orderErr.message, 500));

  const imagePaths = await fetchPrimaryImagePaths(
    supabase,
    validation.available.map((p) => p.id),
  );

  const itemsToInsert = validation.available.map((p) => ({
    order_id: order.id,
    product_id: p.id,
    product_title: p.title,
    product_piece_id: p.piece_id,
    product_slug: p.slug,
    price_cents: p.price_cents,
    primary_image_path: imagePaths.get(p.id) ?? null,
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
  if (itemsErr) {
    await supabase.from('orders').delete().eq('id', order.id);
    return wrap(fail(itemsErr.message, 500));
  }

  // (5) Create Stripe Checkout Session.
  const siteUrl = import.meta.env.PUBLIC_SITE_URL || url.origin;

  const lineItems = validation.available.map((p) => {
    const path = imagePaths.get(p.id) ?? null;
    const imageUrl = path ? publicImageUrl(supabase, path) : null;
    return {
      price_data: {
        currency: 'usd',
        product_data: {
          name: p.title,
          description: `Piece ${p.piece_id}`,
          images: imageUrl ? [imageUrl] : [],
        },
        unit_amount: p.price_cents,
        tax_behavior: 'exclusive' as const,
      },
      quantity: 1,
    };
  });

  const descriptorSuffix = order.order_number
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 22);

  let session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: shippingCents, currency: 'usd' },
            display_name: freshRate.service_level,
            delivery_estimate: {
              minimum: {
                unit: 'business_day',
                value: Math.max(2, freshRate.estimated_days - 1),
              },
              maximum: { unit: 'business_day', value: freshRate.estimated_days + 1 },
            },
            tax_behavior: 'exclusive',
          },
        },
      ],
      automatic_tax: { enabled: true },
      customer_email: email,
      shipping_address_collection: { allowed_countries: ['US'] },
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
      },
      payment_intent_data: {
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
        },
        statement_descriptor_suffix: descriptorSuffix,
      },
      success_url: `${siteUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
  } catch (e) {
    // Roll back the pending order so we don't accumulate zombie rows.
    await supabase.from('order_items').delete().eq('order_id', order.id);
    await supabase.from('orders').delete().eq('id', order.id);
    console.error('Stripe session creation failed', e);
    return wrap(fail((e as Error).message || 'Payment session failed', 500));
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', order.id);
  if (updErr) {
    console.warn('Failed to store stripe_checkout_session_id', updErr.message);
  }

  if (!session.url) {
    return wrap(fail('Stripe did not return a session URL', 500));
  }

  return wrap(ok({ redirect_to: session.url, order_number: order.order_number }));
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
