// Server-only Shippo helper. Never import from client-side code.
// SDK v2 uses camelCase keys. See https://docs.goshippo.com/.
import { Shippo } from 'shippo';
import type { SupabaseClient } from '@supabase/supabase-js';

let _client: Shippo | null = null;

function getClient(): Shippo {
  if (_client) return _client;
  const key = import.meta.env.SHIPPO_API_KEY;
  if (!key) throw new Error('SHIPPO_API_KEY is not set');
  _client = new Shippo({ apiKeyHeader: key });
  return _client;
}

export interface ShippingRate {
  rate_id: string;
  amount_cents: number;
  service_level: string;
  estimated_days: number;
  provider: string;
}

export interface ShipToAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface ShipFromSettings {
  name: string;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
  email: string | null;
  length_in: number;
  width_in: number;
  height_in: number;
  weight_oz: number;
}

export async function loadShippingSettings(
  supabase: SupabaseClient,
): Promise<ShipFromSettings | null> {
  const { data, error } = await supabase
    .from('shipping_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    name: data.ship_from_name,
    street1: data.ship_from_street1,
    street2: data.ship_from_street2,
    city: data.ship_from_city,
    state: data.ship_from_state,
    zip: data.ship_from_zip,
    country: data.ship_from_country,
    phone: data.ship_from_phone,
    email: data.ship_from_email,
    length_in: Number(data.default_length_in),
    width_in: Number(data.default_width_in),
    height_in: Number(data.default_height_in),
    weight_oz: Number(data.default_weight_oz),
  };
}

export async function getUspsGroundAdvantageRate(args: {
  settings: ShipFromSettings;
  to: ShipToAddress;
  itemCount: number;
}): Promise<ShippingRate | null> {
  const { settings, to, itemCount } = args;
  const totalWeightOz = Math.max(1, settings.weight_oz * Math.max(1, itemCount));

  try {
    const client = getClient();
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
        name: to.name,
        street1: to.street1,
        street2: to.street2 ?? undefined,
        city: to.city,
        state: to.state,
        zip: to.zip,
        country: to.country,
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

    const rates: any[] = shipment?.rates ?? [];
    if (!Array.isArray(rates) || rates.length === 0) {
      console.warn('Shippo returned no rates', { messages: shipment?.messages });
      return null;
    }

    const rate = rates.find((r) => {
      const token = r.servicelevel?.token || r.serviceLevel?.token;
      return token === 'usps_ground_advantage';
    });
    if (!rate) {
      console.warn(
        'Shippo: no USPS Ground Advantage option in returned rates',
        rates.map((r) => r.servicelevel?.token ?? r.serviceLevel?.token),
      );
      return null;
    }

    const amountStr: string = rate.amount ?? '0';
    const amountCents = Math.round(parseFloat(amountStr) * 100);
    const estimatedDays: number =
      typeof rate.estimatedDays === 'number'
        ? rate.estimatedDays
        : typeof rate.estimated_days === 'number'
          ? rate.estimated_days
          : 3;
    const serviceLevel: string =
      rate.servicelevel?.name ??
      rate.serviceLevel?.name ??
      'USPS Ground Advantage';
    const provider: string = rate.provider ?? 'USPS';

    const rateId: string = rate.objectId ?? rate.object_id ?? '';
    if (!rateId) return null;

    return {
      rate_id: rateId,
      amount_cents: amountCents,
      service_level: serviceLevel,
      estimated_days: estimatedDays,
      provider,
    };
  } catch (err) {
    console.error('Shippo rate lookup failed', err);
    return null;
  }
}
