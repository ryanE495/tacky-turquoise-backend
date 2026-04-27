// Returns a short-lived signed URL the browser can PUT a draft image to
// directly. Bypasses the Netlify Functions ~6 MB body limit so phone-camera
// photos work. Pair with the form-submit flow that posts the
// { slot_index, storage_path } pairs to /api/admin/products on create.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { publicImageUrl } from '~/lib/images';
import { isUuid, isValidSlot } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const productId = body.product_id;
  const slot = parseInt(String(body.slot_index), 10);
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const contentType = typeof body.content_type === 'string' ? body.content_type : '';

  if (!isUuid(productId)) return fail('Invalid product_id (expected UUID)', 400);
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);

  const ext = deriveExt(filename, contentType);
  const uuid = crypto.randomUUID();
  const storagePath = `${productId}/${slot}-${uuid}.${ext}`;

  const supabase = createSupabaseAdminClient();
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
