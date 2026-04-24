// Server-only helpers for label printing. Reuses the Shippo client from
// src/lib/shippo.ts; don't instantiate a second one.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getShippoClient, loadShippingSettings } from './shippo';
import { createSupabaseAdminClient } from './supabase/admin';

export interface LabelRate {
  rate_id: string;
  provider: string;
  service_level: string;
  service_token: string;
  amount_cents: number;
  estimated_days: number | null;
  duration_terms: string | null;
}

export interface LabelRateList {
  shipment_id: string;
  rates: LabelRate[];
}

export async function getAvailableRatesForOrder(
  orderId: string,
): Promise<LabelRateList | null> {
  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      'id, status, ship_to_name, ship_to_line1, ship_to_line2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country',
    )
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr || !order) return null;

  const { count: itemCount } = await supabase
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);

  const settings = await loadShippingSettings(supabase);
  if (!settings) return null;

  const totalWeightOz = Math.max(
    1,
    settings.weight_oz * Math.max(1, itemCount ?? 1),
  );

  try {
    const client = getShippoClient();
    const shipment = (await client.shipments.create({
      addressFrom: {
        name: settings.name,
        street1: settings.street1,
        street2: settings.street2 ?? undefined,
        city: settings.city,
        state: settings.state,
        zip: settings.zip,
        country: settings.country,
        phone: settings.phone ?? undefined,
        email: settings.email ?? undefined,
      },
      addressTo: {
        name: order.ship_to_name,
        street1: order.ship_to_line1,
        street2: order.ship_to_line2 ?? undefined,
        city: order.ship_to_city,
        state: order.ship_to_state,
        zip: order.ship_to_postal_code,
        country: order.ship_to_country,
      },
      parcels: [
        {
          length: String(settings.length_in),
          width: String(settings.width_in),
          height: String(settings.height_in),
          distanceUnit: 'in',
          weight: String(totalWeightOz.toFixed(2)),
          massUnit: 'oz',
        },
      ],
      async: false,
    } as any)) as any;

    const shipmentId: string = shipment?.objectId ?? shipment?.object_id ?? '';
    const rawRates: any[] = shipment?.rates ?? [];
    if (!shipmentId || !Array.isArray(rawRates) || rawRates.length === 0) {
      console.warn('Shippo returned no rates for label', {
        orderId,
        messages: shipment?.messages,
      });
      return null;
    }

    const rates: LabelRate[] = rawRates
      .map((r) => mapRate(r))
      .filter((r): r is LabelRate => r !== null)
      .sort((a, b) => a.amount_cents - b.amount_cents);

    return { shipment_id: shipmentId, rates };
  } catch (err) {
    console.error('Shippo rate list failed', { orderId, err });
    return null;
  }
}

function mapRate(r: any): LabelRate | null {
  const rateId: string = r.objectId ?? r.object_id ?? '';
  if (!rateId) return null;
  const amountStr: string = r.amount ?? '0';
  const amountCents = Math.round(parseFloat(amountStr) * 100);
  const serviceLevel = r.servicelevel ?? r.serviceLevel ?? {};
  const estimatedDays =
    typeof r.estimatedDays === 'number'
      ? r.estimatedDays
      : typeof r.estimated_days === 'number'
        ? r.estimated_days
        : null;
  const durationTerms: string | null =
    r.durationTerms ?? r.duration_terms ?? null;
  return {
    rate_id: rateId,
    provider: r.provider ?? '',
    service_level: serviceLevel.name ?? 'Unknown',
    service_token: serviceLevel.token ?? '',
    amount_cents: Number.isFinite(amountCents) ? amountCents : 0,
    estimated_days: estimatedDays,
    duration_terms: durationTerms,
  };
}

export interface PurchaseLabelResult {
  ok: true;
  data: {
    tracking_number: string;
    tracking_url: string;
    label_url: string;
    shipped_at: string;
  };
}
export interface PurchaseLabelError {
  ok: false;
  error: string;
  code?: 'already_purchased' | 'not_paid' | 'shippo_error' | 'persist_error';
}

export async function purchaseLabel(params: {
  orderId: string;
  rateId: string;
  onLabelPurchased?: (args: {
    supabase: SupabaseClient;
    orderId: string;
    transaction: any;
  }) => Promise<void>;
}): Promise<PurchaseLabelResult | PurchaseLabelError> {
  const { orderId, rateId, onLabelPurchased } = params;
  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, label_url')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return { ok: false, code: 'persist_error', error: 'Order not found' };
  }
  if (order.status !== 'paid') {
    return {
      ok: false,
      code: 'not_paid',
      error: `Order status is "${order.status}"; must be "paid" to ship`,
    };
  }
  if (order.label_url) {
    return {
      ok: false,
      code: 'already_purchased',
      error: 'A label has already been purchased for this order',
    };
  }

  let transaction: any;
  try {
    const client = getShippoClient();
    transaction = await client.transactions.create({
      rate: rateId,
      async: false,
      labelFileType: 'PDF',
    } as any);
  } catch (err) {
    console.error('Shippo transactions.create threw', { orderId, rateId, err });
    return {
      ok: false,
      code: 'shippo_error',
      error: (err as Error).message || 'Shippo transaction failed',
    };
  }

  const status: string = transaction?.status ?? '';
  if (status !== 'SUCCESS') {
    const messages: any[] = transaction?.messages ?? [];
    const msg =
      messages
        .map((m: any) => m?.text ?? m?.message ?? String(m))
        .filter(Boolean)
        .join('; ') ||
      (status === 'ERROR'
        ? 'Shippo reported an error purchasing the label'
        : 'Label purchase did not complete synchronously');
    return { ok: false, code: 'shippo_error', error: msg };
  }

  const shippoTransactionId: string =
    transaction.objectId ?? transaction.object_id ?? '';
  const trackingNumber: string =
    transaction.trackingNumber ?? transaction.tracking_number ?? '';
  const trackingUrl: string =
    transaction.trackingUrlProvider ?? transaction.tracking_url_provider ?? '';
  const labelUrl: string = transaction.labelUrl ?? transaction.label_url ?? '';

  if (!labelUrl || !trackingNumber) {
    console.error('Shippo SUCCESS without tracking/label info', {
      orderId,
      transactionId: shippoTransactionId,
      transaction,
    });
    return {
      ok: false,
      code: 'shippo_error',
      error: 'Shippo returned no tracking number or label URL',
    };
  }

  const shippedAt = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('orders')
    .update({
      shippo_transaction_id: shippoTransactionId,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      label_created_at: shippedAt,
      shippo_rate_id_used: rateId,
      status: 'shipped',
      shipped_at: shippedAt,
    })
    .eq('id', orderId);

  if (updErr) {
    // BAD STATE: Shippo charged for the label but we can't record it.
    // Log every identifier so manual reconciliation is possible.
    console.error(
      '[CRITICAL] Shippo label purchased but DB update failed — manual reconciliation needed',
      {
        orderId,
        rateId,
        shippoTransactionId,
        trackingNumber,
        labelUrl,
        dbError: updErr.message,
      },
    );
    return {
      ok: false,
      code: 'persist_error',
      error: `Label purchased but DB update failed — contact engineering with order ${orderId} and shippo transaction ${shippoTransactionId}. Error: ${updErr.message}`,
    };
  }

  // Side effect: fire the shipping notification email.
  // Must not fail the label purchase — label is already bought.
  if (onLabelPurchased) {
    try {
      await onLabelPurchased({ supabase, orderId, transaction });
    } catch (err) {
      console.error('Shipping notification side effect failed', { orderId, err });
    }
  }

  return {
    ok: true,
    data: {
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      shipped_at: shippedAt,
    },
  };
}
