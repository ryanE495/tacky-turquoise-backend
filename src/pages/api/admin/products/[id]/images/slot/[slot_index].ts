import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { isValidSlot } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);
  const productId = params.id;
  const slot = parseInt(String(params.slot_index), 10);
  if (!productId) return fail('Missing product id', 400);
  if (!isValidSlot(slot)) return fail('slot_index must be 0-4', 400);

  const supabase = createSupabaseAdminClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('product_images')
    .select('id, storage_path')
    .eq('product_id', productId)
    .eq('display_order', slot)
    .maybeSingle();
  if (fetchErr) return fail(fetchErr.message, 500);
  if (!existing) return ok({ slot_index: slot, deleted: false });

  const { error: storageErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove([existing.storage_path]);
  if (storageErr) return fail(storageErr.message, 500);

  const { error: delErr } = await supabase
    .from('product_images')
    .delete()
    .eq('id', existing.id);
  if (delErr) return fail(delErr.message, 500);

  return ok({ slot_index: slot, deleted: true });
};
