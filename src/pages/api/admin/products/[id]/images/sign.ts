// Returns a signed URL the browser can PUT a slot image to directly.
// Pair with /commit (below) which upserts the product_images row after
// the upload succeeds.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { publicImageUrl } from '~/lib/images';
import { isValidSlot } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const productId = params.id;
  if (!productId) return fail('Missing product id', 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const slot = parseInt(String(body.slot_index), 10);
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const contentType = typeof body.content_type === 'string' ? body.content_type : '';
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);

  const supabase = createSupabaseAdminClient();

  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);
  if (!product) return fail('Product not found', 404);

  const ext = deriveExt(filename, contentType);
  const uuid = crypto.randomUUID();
  const storagePath = `${productId}/${slot}-${uuid}.${ext}`;

  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error) return fail(error.message, 500);

  return ok({
    slot_index: slot,
    storage_path: storagePath,
    signed_url: data.signedUrl,
    token: data.token,
    public_url: publicImageUrl(supabase, storagePath),
  });
};

function deriveExt(filename: string, contentType: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}
