import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateCart, fetchPrimaryImagePaths } from '~/lib/cart-validate';
import { FLAT_SHIPPING_CENTS, US_STATES } from '~/lib/orders';
import { ok, fail } from '~/lib/api';

export const prerender = false;

const US_STATE_SET = new Set(US_STATES.map((s) => s.value));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  if (productIds.length === 0) return fail('Cart is empty', 400);

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

  if (!EMAIL_RE.test(email)) return fail('Valid email is required', 400);
  if (!name) return fail('Name is required', 400);
  if (!line1) return fail('Address is required', 400);
  if (!city) return fail('City is required', 400);
  if (!US_STATE_SET.has(state)) return fail('Valid state is required', 400);
  if (!ZIP_RE.test(postal)) return fail('Valid ZIP code is required', 400);

  const supabase = createSupabaseAdminClient();

  let validation;
  try {
    validation = await validateCart(supabase, productIds);
  } catch (e) {
    return fail((e as Error).message, 500);
  }

  if (validation.unavailable.length > 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'items_unavailable',
          unavailable: validation.unavailable,
        },
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    );
  }
  if (validation.available.length === 0) return fail('Cart is empty', 400);

  const subtotal = validation.available.reduce((sum, p) => sum + p.price_cents, 0);
  const shipping = FLAT_SHIPPING_CENTS;
  const tax = 0;
  const total = subtotal + shipping + tax;

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
      subtotal_cents: subtotal,
      shipping_cents: shipping,
      tax_cents: tax,
      total_cents: total,
      customer_notes: customerNotes,
    })
    .select('id, order_number')
    .single();

  if (orderErr) return fail(orderErr.message, 500);

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
    return fail(itemsErr.message, 500);
  }

  // TODO(stripe): Replace this block with Stripe Checkout Session creation.
  // - Create session with line_items from order_items
  // - Set metadata.order_id = order.id
  // - Set success_url = /order/success?session_id={CHECKOUT_SESSION_ID}
  // - Set cancel_url = /checkout?cancelled=1
  // - Return { redirect_to: session.url } instead of the local success page
  const redirectTo = `/order/success?order=${encodeURIComponent(order.order_number)}`;

  return ok(
    {
      order_id: order.id,
      order_number: order.order_number,
      redirect_to: redirectTo,
    },
    { status: 201 },
  );
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
