import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { MEDIA_BUCKET, MEDIA_MAX_BYTES, publicUrl } from '~/lib/media';
import { inferExt } from '~/lib/upload';
import { ok, fail } from '~/lib/api';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return fail('Unauthorized', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail('Missing file', 400);
  if (file.size > MEDIA_MAX_BYTES) return fail('File exceeds 10MB limit', 400);

  const supabase = createSupabaseAdminClient();
  const ext = inferExt(file);
  const name = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(name, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) return fail(error.message, 500);

  return ok(
    {
      name,
      size: file.size,
      mimetype: file.type || null,
      url: publicUrl(supabase, name),
      created_at: new Date().toISOString(),
    },
    { status: 201 },
  );
};
