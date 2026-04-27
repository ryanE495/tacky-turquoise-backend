// Bulk delete for cleaning up test products. Removes the storage objects
// and the rows. By default skips any product referenced by an order_item
// (FK is `on delete restrict`). When force_delete_orders=true, the orders
// containing those products are deleted entirely first, clearing the path.
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
  order_numbers: string[];
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

  const forceDeleteOrders = !!body.force_delete_orders;

  const supabase = createSupabaseAdminClient();

  // Inspect order_items for the requested products. We need order_id +
  // order_number for the response so the UI can offer a precise cascade.
  const { data: linkRows, error: linkErr } = await supabase
    .from('order_items')
    .select('product_id, order_id, orders!inner(order_number)')
    .in('product_id', ids);
  if (linkErr) return fail(linkErr.message, 500);

  const productOrderNumbers = new Map<string, Set<string>>();
  const associatedOrderIds = new Set<string>();
  for (const r of linkRows ?? []) {
    const pid = (r as any).product_id as string;
    const oid = (r as any).order_id as string;
    const orderNumber = ((r as any).orders?.order_number as string) ?? '';
    associatedOrderIds.add(oid);
    if (!productOrderNumbers.has(pid)) productOrderNumbers.set(pid, new Set());
    if (orderNumber) productOrderNumbers.get(pid)!.add(orderNumber);
  }

  let deletedOrderNumbers: string[] = [];
  if (forceDeleteOrders && associatedOrderIds.size > 0) {
    // Delete the entire orders that reference any of these products.
    // order_items cascade via FK on the orders table.
    const orderIds = Array.from(associatedOrderIds);
    const { data: deletedOrders, error: orderDelErr } = await supabase
      .from('orders')
      .delete()
      .in('id', orderIds)
      .select('order_number');
    if (orderDelErr) return fail(orderDelErr.message, 500);
    deletedOrderNumbers = (deletedOrders ?? []).map((o) => o.order_number);
  }

  // After (optional) order cleanup, recompute which products are still
  // blocked. If we just nuked the linked orders, blockedIds should be empty.
  let blockedIds = new Set(productOrderNumbers.keys());
  if (forceDeleteOrders) {
    const { data: stillBlocking } = await supabase
      .from('order_items')
      .select('product_id')
      .in('product_id', ids);
    blockedIds = new Set((stillBlocking ?? []).map((r) => r.product_id));
  }

  const skipped: SkippedItem[] = [];
  if (blockedIds.size > 0) {
    const { data: titles } = await supabase
      .from('products')
      .select('id, title')
      .in('id', Array.from(blockedIds));
    const titleById = new Map((titles ?? []).map((p) => [p.id, p.title]));
    for (const id of blockedIds) {
      skipped.push({
        id,
        title: titleById.get(id) ?? null,
        reason: 'in_order',
        order_numbers: Array.from(productOrderNumbers.get(id) ?? []),
      });
    }
  }

  const deletableIds = ids.filter((id) => !blockedIds.has(id));

  if (deletableIds.length === 0) {
    return ok({
      deleted_count: 0,
      skipped,
      deleted_orders: deletedOrderNumbers,
      associated_order_numbers: uniqueOrderNumbers(productOrderNumbers),
    });
  }

  // Storage cleanup before product delete (FK cascades the image rows).
  const { data: imgRows } = await supabase
    .from('product_images')
    .select('storage_path')
    .in('product_id', deletableIds);
  const storagePaths = (imgRows ?? [])
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (storagePaths.length > 0) {
    const { error: rmErr } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove(storagePaths);
    if (rmErr) {
      console.warn('bulk-delete: storage cleanup failed', rmErr.message);
    }
  }

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
    deleted_orders: deletedOrderNumbers,
    associated_order_numbers: uniqueOrderNumbers(productOrderNumbers),
  });
};

function uniqueOrderNumbers(map: Map<string, Set<string>>): string[] {
  const all = new Set<string>();
  for (const set of map.values()) for (const n of set) all.add(n);
  return Array.from(all).sort();
}
