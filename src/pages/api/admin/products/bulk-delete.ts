// Bulk delete for cleaning up test products. Removes the storage objects
// and the rows. Skips any product referenced by an order (order_items has
// `on delete restrict`); skipped ids are reported so the UI can explain.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { PRODUCT_IMAGES_BUCKET } from '~/lib/supabase/types';
import { isUuid } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

interface SkippedItem {
  id: string;
  title: string | null;
  reason: 'in_order' | 'unknown';
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON body', 400);
  }

  const idsRaw: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(new Set(idsRaw.filter(isUuid))) as string[];
  if (ids.length === 0) return fail('ids[] is required', 400);

  const supabase = createSupabaseAdminClient();

  // 1. Filter out any product that's referenced by an order_items row.
  const { data: blocked } = await supabase
    .from('order_items')
    .select('product_id')
    .in('product_id', ids);
  const blockedIds = new Set((blocked ?? []).map((r) => r.product_id));

  const deletableIds = ids.filter((id) => !blockedIds.has(id));
  const skipped: SkippedItem[] = [];

  if (blockedIds.size > 0) {
    const { data: titles } = await supabase
      .from('products')
      .select('id, title')
      .in('id', Array.from(blockedIds));
    const titleById = new Map((titles ?? []).map((p) => [p.id, p.title]));
    for (const id of blockedIds) {
      skipped.push({ id, title: titleById.get(id) ?? null, reason: 'in_order' });
    }
  }

  if (deletableIds.length === 0) {
    return ok({ deleted_count: 0, skipped });
  }

  // 2. Collect storage paths for everything we're about to delete.
  const { data: imgRows } = await supabase
    .from('product_images')
    .select('storage_path')
    .in('product_id', deletableIds);
  const storagePaths = (imgRows ?? [])
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  // 3. Remove storage objects (best-effort; an error here doesn't block the
  //    DB delete because the row is the source of truth — orphaned blobs
  //    just leak storage cost).
  if (storagePaths.length > 0) {
    const { error: rmErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove(storagePaths);
    if (rmErr) {
      console.warn('bulk-delete: storage cleanup failed', rmErr.message);
    }
  }

  // 4. Delete the products. product_images cascades via FK.
  const { data: deleted, error: delErr } = await supabase
    .from('products')
    .delete()
    .in('id', deletableIds)
    .select('id, title');
  if (delErr) {
    return fail(delErr.message, 500);
  }

  return ok({
    deleted_count: deleted?.length ?? 0,
    skipped,
  });
};
