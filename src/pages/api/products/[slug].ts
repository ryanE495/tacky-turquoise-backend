import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '~/lib/supabase/server';
import { publicImageUrl } from '~/lib/images';
import { ok, fail } from '~/lib/api';

export const prerender = false;

// Explicit column list — cost_cents must never leak out of the public API.
const PUBLIC_COLUMNS =
  'id, slug, piece_id, title, description, price_cents, length, meta_description, status, featured, published_at, created_at, sold_at, product_images(id, storage_path, alt_text, display_order)';

export const GET: APIRoute = async ({ params, cookies, request }) => {
  const slug = params.slug;
  if (!slug) return fail('Missing slug', 400);

  const supabase = createSupabaseServerClient({ cookies, request });

  const { data: product, error } = await supabase
    .from('products')
    .select(PUBLIC_COLUMNS)
    .eq('slug', slug)
    .in('status', ['published', 'sold'])
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!product) return fail('Not found', 404);

  const images = ((product as any).product_images ?? [])
    .slice()
    .sort((a: any, b: any) => a.display_order - b.display_order)
    .map((img: any) => ({
      slot_index: img.display_order,
      url: publicImageUrl(supabase, img.storage_path),
      alt_text: img.alt_text,
    }));

  const { product_images, ...rest } = product as any;
  return ok({ ...rest, images });
};
