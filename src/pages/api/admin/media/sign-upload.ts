// Returns a short-lived signed URL the browser can PUT a file to directly.
// Using this path instead of posting the file through an Astro/Netlify
// function avoids the 6 MB serverless body limit — files go straight from
// the browser to Supabase Storage, capped only by the bucket's file_size_limit.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { MEDIA_BUCKET, publicUrl } from '~/lib/media';
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

  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const contentType = typeof body.content_type === 'string' ? body.content_type : '';

  const ext = deriveExt(filename, contentType);
  const path = `${crypto.randomUUID()}.${ext}`;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return fail(error.message, 500);

  return ok({
    path,
    signed_url: data.signedUrl,
    token: data.token,
    public_url: publicUrl(supabase, path),
  });
};

function deriveExt(filename: string, contentType: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}
