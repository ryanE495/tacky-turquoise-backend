// TODO(stripe): REMOVE THIS ENDPOINT when Stripe webhook is wired.
// Production payment confirmation comes from Stripe's checkout.session.completed webhook,
// not from the success page. This stub exists only for UI testing without a Stripe account.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  const orderNumber = params.order_number;
  if (!orderNumber) return fail('Missing order_number', 400);

  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) return fail(orderErr.message, 500);
  if (!order) return fail('Order not found', 404);
  if (order.status !== 'pending') {
    return ok({ order_number: orderNumber, status: order.status, noop: true });
  }

  const nowIso = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('orders')
    .update({ status: 'paid', paid_at: nowIso })
    .eq('id', order.id);
  if (updErr) return fail(updErr.message, 500);

  const { data: items } = await supabase
    .from('order_items')
    .select('product_id')
    .eq('order_id', order.id);

  const productIds = (items ?? []).map((i) => i.product_id);
  if (productIds.length > 0) {
    const { error: prodErr } = await supabase
      .from('products')
      .update({ status: 'sold', sold_at: nowIso })
      .in('id', productIds);
    if (prodErr) {
      return fail(`Order marked paid but marking products sold failed: ${prodErr.message}`, 500);
    }
  }

  return ok({ order_number: orderNumber, status: 'paid', paid_at: nowIso });
};
