import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidSlug, slugExists } from './slug';
import type { ProductStatus } from './supabase/types';

const STATUSES: ProductStatus[] = ['draft', 'published', 'sold', 'archived'];

export interface ProductInput {
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  cost_cents: number | null;
  status: ProductStatus;
  featured: boolean;
  length: string | null;
  meta_description: string | null;
}

export type ValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; error: string };

export async function validateProductInput(
  raw: Record<string, unknown>,
  supabase: SupabaseClient,
  excludeId?: string,
): Promise<ValidationResult> {
  const title = str(raw.title).trim();
  const slug = str(raw.slug).trim();
  const priceCents = toInt(raw.price_cents);
  const costCents = toInt(raw.cost_cents);

  if (!title) return { ok: false, error: 'Title is required' };
  if (!slug) return { ok: false, error: 'Slug is required' };
  if (!isValidSlug(slug)) {
    return { ok: false, error: 'Slug must be kebab-case (lowercase letters, numbers, single dashes)' };
  }
  if (priceCents === null || Number.isNaN(priceCents) || priceCents < 0) {
    return { ok: false, error: 'Price must be a non-negative integer (cents)' };
  }
  if (costCents !== null && (Number.isNaN(costCents) || costCents < 0)) {
    return { ok: false, error: 'Cost must be a non-negative integer (cents)' };
  }

  const statusRaw = str(raw.status) || 'draft';
  if (!STATUSES.includes(statusRaw as ProductStatus)) {
    return { ok: false, error: `Status must be one of: ${STATUSES.join(', ')}` };
  }

  if (await slugExists(supabase, slug, excludeId)) {
    return { ok: false, error: 'Slug is already in use' };
  }

  return {
    ok: true,
    value: {
      slug,
      title,
      description: nullable(raw.description),
      price_cents: priceCents,
      cost_cents: costCents,
      status: statusRaw as ProductStatus,
      featured: toBool(raw.featured),
      length: nullable(raw.length),
      meta_description: nullable(raw.meta_description),
    },
  };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function nullable(v: unknown): string | null {
  const s = str(v).trim();
  return s === '' ? null : s;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1' || v === 'on';
  if (typeof v === 'number') return v !== 0;
  return false;
}

export function dollarsToCents(dollars: unknown): number | null {
  if (dollars === null || dollars === undefined || dollars === '') return null;
  const n = typeof dollars === 'number' ? dollars : parseFloat(String(dollars));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
