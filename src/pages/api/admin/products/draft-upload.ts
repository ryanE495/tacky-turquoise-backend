// Draft uploads for the new-product flow: images land in storage before the
// product row exists. The client pre-generates a UUID and sends it as
// product_id so uploads can be keyed to the eventual row.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { publicImageUrl } from '~/lib/images';
import { inferExt, isUuid, isValidSlot, MAX_BYTES } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data', 400);
  }

  const productId = form.get('product_id');
  const slotRaw = form.get('slot_index');
  const file = form.get('file');

  if (!isUuid(productId)) return fail('Invalid product_id (expected UUID)', 400);
  const slot = parseInt(String(slotRaw), 10);
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);

  if (!(file instanceof File)) return fail('Missing file', 400);
  if (!file.type.startsWith('image/')) return fail('File must be an image', 400);
  if (file.size > MAX_BYTES) return fail('Image exceeds 10MB limit', 400);

  const supabase = createSupabaseAdminClient();
  const ext = inferExt(file);
  const uuid = crypto.randomUUID();
  const storagePath = `${productId}/${slot}-${uuid}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error) return fail(error.message, 500);

  return ok(
    {
      slot_index: slot,
      storage_path: storagePath,
      public_url: publicImageUrl(supabase, storagePath),
    },
    { status: 201 },
  );
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : '';
  if (!storagePath) return fail('storage_path is required', 400);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
  if (error) return fail(error.message, 500);
  return ok({ storage_path: storagePath });
};
