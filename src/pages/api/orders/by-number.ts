// Public endpoint: order confirmation lookup. Returns sanitized data only —
// no admin_notes, no internal IDs beyond order_number.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { publicImageUrl } from '~/lib/images';
import { ok, fail } from '~/lib/api';
import { handleOptions, withCors } from '~/lib/cors';

export const prerender = false;

export const OPTIONS: APIRoute = ({ request }) => handleOptions(request);

export const GET: APIRoute = async ({ url, request }) => {
  const wrap = (r: Response) => withCors(request, r);

  const orderNumber = url.searchParams.get('order')?.trim();
  if (!orderNumber) return wrap(fail('Missing order query param', 400));

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_number, status, customer_email, customer_name, ship_to_name, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country, subtotal_cents, shipping_cents, tax_cents, total_cents, created_at',
    )
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) return wrap(fail(error.message, 500));
  if (!order) return wrap(fail('Order not found', 404));

  const { data: items } = await supabase
    .from('order_items')
    .select('product_title, product_piece_id, product_slug, price_cents, primary_image_path')
    .eq(
      'order_id',
      (
        await supabase
          .from('orders')
          .select('id')
          .eq('order_number', orderNumber)
          .single()
      ).data?.id ?? '',
    );

  const shapedItems = (items ?? []).map((it) => ({
    title: it.product_title,
    piece_id: it.product_piece_id,
    slug: it.product_slug,
    price_cents: it.price_cents,
    primary_image_url: it.primary_image_path
      ? publicImageUrl(supabase, it.primary_image_path)
      : null,
  }));

  return wrap(ok({
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
    created_at: order.created_at,
  }));
};
