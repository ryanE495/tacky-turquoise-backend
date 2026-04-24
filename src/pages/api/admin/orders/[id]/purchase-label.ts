import type { APIRoute } from 'astro';
import { purchaseLabel } from '~/lib/shippo-labels';
import { sendEmail } from '~/lib/emails/send';
import { shippingNotificationEmail } from '~/lib/emails/shipping-notification';
import { isUuid } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const id = params.id;
  if (!id || !isUuid(id)) return fail('Invalid order id', 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const rateId = typeof body.rate_id === 'string' ? body.rate_id.trim() : '';
  if (!rateId) return fail('rate_id is required', 400);

  const result = await purchaseLabel({
    orderId: id,
    rateId,
    onLabelPurchased: async ({ supabase, orderId }) => {
      // Load the fresh order row with the label/tracking info already written,
      // then fire the shipping notification email.
      const { data: order } = await supabase
        .from('orders')
        .select(
          'order_number, customer_name, customer_email, tracking_number, tracking_url, shipping_service_level, ship_to_name, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country',
        )
        .eq('id', orderId)
        .maybeSingle();
      if (!order || !order.customer_email || !order.tracking_number || !order.tracking_url) {
        console.warn('Skipping shipping notification — missing fields', { orderId });
        return;
      }
      const { subject, html, text } = shippingNotificationEmail({
        order_number: order.order_number,
        customer_name: order.customer_name,
        tracking_number: order.tracking_number,
        tracking_url: order.tracking_url,
        shipping_service_level: order.shipping_service_level,
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
        emailType: 'shipping_notification',
      });
    },
  });

  if (!result.ok) {
    const status =
      result.code === 'already_purchased' || result.code === 'not_paid' ? 409 : 500;
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: result.code ?? 'label_error', message: result.error },
      }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  }

  return ok(result.data);
};
