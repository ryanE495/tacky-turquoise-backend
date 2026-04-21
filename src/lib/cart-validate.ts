// Server-side cart validation. Used by /api/cart/validate and /api/checkout/create.
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicImageUrl } from './images';
import { isUuid } from './upload';
import type {
  AvailableCartProduct,
  UnavailableCartProduct,
  UnavailableReason,
} from './orders';

export interface CartValidationResult {
  available: AvailableCartProduct[];
  unavailable: UnavailableCartProduct[];
}

export async function validateCart(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<CartValidationResult> {
  const ids = Array.from(new Set(productIds.filter(isUuid)));
  if (ids.length === 0) return { available: [], unavailable: [] };

  const { data: rows, error } = await supabase
    .from('products')
    .select(
      'id, slug, piece_id, title, price_cents, length, status, product_images(storage_path, display_order)',
    )
    .in('id', ids);
  if (error) throw error;

  const found = new Map<string, any>();
  for (const r of rows ?? []) found.set(r.id, r);

  const available: AvailableCartProduct[] = [];
  const unavailable: UnavailableCartProduct[] = [];

  for (const id of ids) {
    const r = found.get(id);
    if (!r) {
      unavailable.push({ id, reason: 'not_found' });
      continue;
    }
    const reason: UnavailableReason | null =
      r.status === 'published'
        ? null
        : r.status === 'sold'
          ? 'sold'
          : r.status === 'archived'
            ? 'archived'
            : 'draft';
    if (reason) {
      unavailable.push({ id, reason, title: r.title, slug: r.slug });
      continue;
    }
    const imgs = (r.product_images ?? []).slice().sort((a: any, b: any) => a.display_order - b.display_order);
    const primaryPath: string | null = imgs[0]?.storage_path ?? null;
    available.push({
      id: r.id,
      slug: r.slug,
      piece_id: r.piece_id,
      title: r.title,
      price_cents: r.price_cents,
      length: r.length,
      primary_image_url: primaryPath ? publicImageUrl(supabase, primaryPath) : null,
    });
  }

  return { available, unavailable };
}

export async function fetchPrimaryImagePaths(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (productIds.length === 0) return map;
  const { data, error } = await supabase
    .from('product_images')
    .select('product_id, storage_path, display_order')
    .in('product_id', productIds)
    .eq('display_order', 0);
  if (error) throw error;
  for (const r of data ?? []) {
    map.set(r.product_id, r.storage_path);
  }
  for (const id of productIds) if (!map.has(id)) map.set(id, null);
  return map;
}
