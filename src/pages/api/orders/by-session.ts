// Public endpoint: companion to by-number, but keyed by the Stripe session id
// (which is what the success page has in the URL after the redirect).
// Includes the order status so the client can detect pending → paid transitions.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { publicImageUrl } from '~/lib/images';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id')?.trim();
  if (!sessionId) return fail('Missing session_id query param', 400);

  const supabase = createSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, customer_email, customer_name, ship_to_name, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_service_level, shipping_estimated_days, created_at',
    )
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!order) return fail('Order not found', 404);

  const { data: items } = await supabase
    .from('order_items')
    .select('product_title, product_piece_id, product_slug, price_cents, primary_image_path')
    .eq('order_id', order.id);

  const shapedItems = (items ?? []).map((it) => ({
    title: it.product_title,
    piece_id: it.product_piece_id,
    slug: it.product_slug,
    price_cents: it.price_cents,
    primary_image_url: it.primary_image_path
      ? publicImageUrl(supabase, it.primary_image_path)
      : null,
  }));

  return ok({
    order_number: order.order_number,
    status: order.status,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    ship_to: {
      name: order.ship_to_name,
      line1: order.ship_to_line1,
      line2: order.ship_to_line2,
      city: order.ship_to_city,
      state: order.ship_to_state,
      postal_code: order.ship_to_postal_code,
      country: order.ship_to_country,
    },
    items: shapedItems,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    tax_cents: order.tax_cents,
    total_cents: order.total_cents,
    shipping_service_level: order.shipping_service_level,
    shipping_estimated_days: order.shipping_estimated_days,
    created_at: order.created_at,
  });
};
