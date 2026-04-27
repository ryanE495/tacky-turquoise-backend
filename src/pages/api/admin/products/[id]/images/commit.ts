// Upserts the product_images row for a slot after the browser has PUT
// the file directly to Supabase Storage. Body: { slot_index, storage_path }.
// If a row already exists for this slot, the old storage object is removed
// and the row's storage_path is swapped (preserves display_order index).
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
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : '';
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);
  if (!storagePath) return fail('storage_path is required', 400);

  // Defense-in-depth: storage_path must be inside this product's folder so
  // a caller can't point a slot at someone else's object.
  if (!storagePath.startsWith(`${productId}/`)) {
    return fail('storage_path does not belong to this product', 400);
  }

  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingErr } = await supabase
    .from('product_images')
    .select('id, storage_path')
    .eq('product_id', productId)
    .eq('display_order', slot)
    .maybeSingle();
  if (existingErr) return fail(existingErr.message, 500);

  let row: Record<string, unknown> | null = null;
  if (existing) {
    const { data, error } = await supabase
      .from('product_images')
      .update({ storage_path: storagePath })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return fail(error.message, 500);
    row = data;
    if (existing.storage_path && existing.storage_path !== storagePath) {
      await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove([existing.storage_path]);
    }
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
    if (error) return fail(error.message, 500);
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
