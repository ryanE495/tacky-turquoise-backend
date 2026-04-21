import type { SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'media';
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export interface MediaItem {
  name: string;
  size: number | null;
  mimetype: string | null;
  created_at: string | null;
  updated_at: string | null;
  url: string;
}

export async function listMedia(supabase: SupabaseClient): Promise<MediaItem[]> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list('', {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name !== '.emptyFolderPlaceholder')
    .map((f) => ({
      name: f.name,
      size: (f.metadata?.size as number | undefined) ?? null,
      mimetype: (f.metadata?.mimetype as string | undefined) ?? null,
      created_at: f.created_at ?? null,
      updated_at: f.updated_at ?? null,
      url: publicUrl(supabase, f.name),
    }));
}

export function publicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
