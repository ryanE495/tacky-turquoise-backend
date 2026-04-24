// Stripe webhook receiver. Signature-verified before any side effects.
// Handlers must be idempotent — Stripe retries on non-2xx responses.
import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { getStripe } from '~/lib/stripe';
import { publicImageUrl } from '~/lib/images';
import { sendEmail } from '~/lib/emails/send';
import { orderConfirmationEmail } from '~/lib/emails/order-confirmation';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook');
    return new Response('Webhook not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        // Unhandled events are fine — just ack so Stripe doesn't retry.
        break;
    }
    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error(`Webhook handler error for ${event.type}:`, err);
    return new Response('Handler error', { status: 500 });
  }
};

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.warn('checkout.session.completed missing order_id metadata', session.id);
    return;
  }

  const supabase = createSupabaseAdminClient();

  const nowIso = new Date().toISOString();
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  const taxCents = session.total_details?.amount_tax ?? 0;
  const totalCents = session.amount_total ?? null;

  const shipping = (session as any).shipping_details?.address ?? session.customer_details?.address;
  const shippingName =
    (session as any).shipping_details?.name ?? session.customer_details?.name ?? null;

  // Atomic: only transition from pending → paid. Duplicate webhooks produce
  // 0 rows affected and a no-op.
  const patch: Record<string, unknown> = {
    status: 'paid',
    paid_at: nowIso,
    stripe_payment_intent_id: paymentIntentId,
    tax_cents: taxCents,
  };
  if (totalCents !== null) patch.total_cents = totalCents;
  if (shipping) {
    if (shippingName) patch.ship_to_name = shippingName;
    if (shipping.line1) patch.ship_to_line1 = shipping.line1;
    if (shipping.line2 !== undefined) patch.ship_to_line2 = shipping.line2 ?? null;
    if (shipping.city) patch.ship_to_city = shipping.city;
    if (shipping.state) patch.ship_to_state = shipping.state;
    if (shipping.postal_code) patch.ship_to_postal_code = shipping.postal_code;
    if (shipping.country) patch.ship_to_country = shipping.country;
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (updErr) {
    throw new Error(`Failed to mark order paid: ${updErr.message}`);
  }
  if (!updated) {
    // Already processed by a prior webhook delivery.
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('product_id')
    .eq('order_id', orderId);
  if (itemsErr) throw itemsErr;

  const productIds = (items ?? []).map((i) => i.product_id);
  if (productIds.length > 0) {
    const { error: prodErr } = await supabase
      .from('products')
      .update({ status: 'sold', sold_at: nowIso })
      .in('id', productIds)
      .neq('status', 'sold');
    if (prodErr) throw prodErr;
  }

  // Order confirmation email. Must not fail the webhook — the order is
  // already paid, and a webhook retry here would re-mark the products
  // sold (no-op) and attempt another send (duplicate email).
  try {
    await sendOrderConfirmation(supabase, orderId);
  } catch (err) {
    console.error('Order confirmation email side effect failed', { orderId, err });
  }
}

async function sendOrderConfirmation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orderId: string,
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select(
      'order_number, customer_name, customer_email, subtotal_cents, shipping_cents, tax_cents, total_cents, ship_to_name, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country',
    )
    .eq('id', orderId)
    .maybeSingle();
  if (!order || !order.customer_email) {
    console.warn('Skipping order confirmation — missing order or email', { orderId });
    return;
  }

  const { data: itemRows } = await supabase
    .from('order_items')
    .select('product_title, product_piece_id, price_cents, primary_image_path')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  const items = (itemRows ?? []).map((it) => ({
    title: it.product_title,
    piece_id: it.product_piece_id,
    price_cents: it.price_cents,
    primary_image_url: it.primary_image_path
      ? publicImageUrl(supabase, it.primary_image_path)
      : null,
  }));

  const { subject, html, text } = orderConfirmationEmail({
    order_number: order.order_number,
    customer_name: order.customer_name,
    items,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    tax_cents: order.tax_cents,
    total_cents: order.total_cents,
    ship_to: {
      name: order.ship_to_name,
      line1: order.ship_to_line1,
      line2: order.ship_to_line2,
      city: order.ship_to_city,
      state: order.ship_to_state,
      postal_code: order.ship_to_postal_code,
      country: order.ship_to_country,
    },
  });

  await sendEmail(supabase, {
    to: order.customer_email,
    subject,
    html,
    text,
    orderId,
    emailType: 'order_confirmation',
  });
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
    .eq('status', 'pending');
  if (error) throw error;
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const orderId = pi.metadata?.order_id;
  if (!orderId) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('orders')
    .update({ status: 'failed' })
    .eq('id', orderId)
    .eq('status', 'pending');
  if (error) throw error;
}
