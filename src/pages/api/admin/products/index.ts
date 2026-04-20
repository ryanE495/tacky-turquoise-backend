import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { validateProductInput } from '~/lib/validate-product';
import { isUuid, isValidSlot } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const supabase = createSupabaseAdminClient();
  const result = await validateProductInput(body, supabase);
  if (!result.ok) return fail(result.error, 400);

  const insertRow: Record<string, unknown> = { ...result.value };
  if (typeof body.id === 'string') {
    if (!isUuid(body.id)) return fail('Invalid id (expected UUID)', 400);
    insertRow.id = body.id;
  }

  const { data: product, error } = await supabase
    .from('products')
    .insert(insertRow)
    .select('*')
    .single();

  if (error) return fail(error.message, 500);

  const imagesRaw = Array.isArray(body.images) ? body.images : [];
  const imageRows: Array<{ product_id: string; storage_path: string; display_order: number; alt_text: null }> = [];
  const seenSlots = new Set<number>();
  for (const img of imagesRaw) {
    if (!img || typeof img !== 'object') continue;
    const slot = (img as any).slot_index;
    const path = (img as any).storage_path;
    if (!isValidSlot(slot)) return fail('images[].slot_index must be 0-4', 400);
    if (seenSlots.has(slot)) return fail(`Duplicate slot_index ${slot}`, 400);
    if (typeof path !== 'string' || !path) return fail('images[].storage_path is required', 400);
    seenSlots.add(slot);
    imageRows.push({
      product_id: product.id,
      storage_path: path,
      display_order: slot,
      alt_text: null,
    });
  }

  if (imageRows.length > 0) {
    const { error: imgErr } = await supabase.from('product_images').insert(imageRows);
    if (imgErr) {
      return fail(`Product created but image link failed: ${imgErr.message}`, 500);
    }
  }

  return ok(product, { status: 201 });
};
