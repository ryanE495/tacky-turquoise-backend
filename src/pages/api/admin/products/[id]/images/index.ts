// Slot-based image upsert for existing products.
// display_order in the DB == slot_index in the UI (0..4).
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { publicImageUrl } from '~/lib/images';
import { inferExt, isValidSlot, MAX_BYTES } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const productId = params.id;
  if (!productId) return fail('Missing product id', 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data', 400);
  }

  const slotRaw = form.get('slot_index');
  const file = form.get('file');

  const slot = parseInt(String(slotRaw), 10);
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);

  if (!(file instanceof File)) return fail('Missing file', 400);
  if (!file.type.startsWith('image/')) return fail('File must be an image', 400);
  if (file.size > MAX_BYTES) return fail('Image exceeds 10MB limit', 400);

  const supabase = createSupabaseAdminClient();

  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .maybeSingle();
  if (productErr) return fail(productErr.message, 500);
  if (!product) return fail('Product not found', 404);

  const { data: existing, error: existingErr } = await supabase
    .from('product_images')
    .select('id, storage_path')
    .eq('product_id', productId)
    .eq('display_order', slot)
    .maybeSingle();
  if (existingErr) return fail(existingErr.message, 500);

  const ext = inferExt(file);
  const uuid = crypto.randomUUID();
  const storagePath = `${productId}/${slot}-${uuid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) return fail(uploadErr.message, 500);

  let row: Record<string, unknown> | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from('product_images')
      .update({ storage_path: storagePath })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
      return fail(error.message, 500);
    }
    row = data;
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([existing.storage_path]);
  } else {
    const { data, error } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        storage_path: storagePath,
        display_order: slot,
        alt_text: null,
      })
      .select('*')
      .single();
    if (error) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
      return fail(error.message, 500);
    }
    row = data;
  }

  return ok(
    {
      ...row,
      slot_index: slot,
      url: publicImageUrl(supabase, storagePath),
    },
    { status: existing ? 200 : 201 },
  );
};
