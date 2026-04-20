import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '~/lib/supabase/server';
import { publicImageUrl } from '~/lib/images';
import { ok, fail } from '~/lib/api';

export const prerender = false;

// Explicit column list — cost_cents must never leak out of the public API.
const PUBLIC_COLUMNS =
  'id, slug, piece_id, title, price_cents, turquoise_type, metal, bead_size, length, status, featured, published_at, created_at, product_images(storage_path, alt_text, display_order)';

export const GET: APIRoute = async ({ cookies, request }) => {
  const supabase = createSupabaseServerClient({ cookies, request });

  const { data: products, error } = await supabase
    .from('products')
    .select(PUBLIC_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return fail(error.message, 500);

  const shaped = (products ?? []).map((p) => {
    const images = (p.product_images ?? []).slice().sort((a, b) => a.display_order - b.display_order);
    const primary = images[0]
      ? { url: publicImageUrl(supabase, images[0].storage_path), alt_text: images[0].alt_text }
      : null;
    return {
      id: p.id,
      slug: p.slug,
      piece_id: p.piece_id,
      title: p.title,
      price_cents: p.price_cents,
      turquoise_type: p.turquoise_type,
      metal: p.metal,
      bead_size: p.bead_size,
      length: p.length,
      status: p.status,
      featured: p.featured,
      published_at: p.published_at,
      primary_image: primary,
    };
  });

  return ok(shaped);
};
