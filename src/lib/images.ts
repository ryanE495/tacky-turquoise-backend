import type { SupabaseClient } from '@supabase/supabase-js';
import { PRODUCT_IMAGES_BUCKET } from './supabase/types';

export function publicImageUrl(supabase: SupabaseClient, storagePath: string): string {
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
