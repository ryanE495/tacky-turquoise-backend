import type { SupabaseClient } from '@supabase/supabase-js';

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export async function slugExists(
  supabase: SupabaseClient,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let query = supabase.from('products').select('id').eq('slug', slug).limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return !!data && data.length > 0;
}

export async function generateUniqueSlug(
  supabase: SupabaseClient,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = toSlug(base) || 'product';
  let candidate = root;
  let n = 2;
  while (await slugExists(supabase, candidate, excludeId)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}
