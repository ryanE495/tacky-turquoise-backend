// Public endpoint: storefront countdown reads this to render the
// "Next drop" banner. CORS-allowlisted so the cross-origin storefront
// can fetch without auth.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';
import { ok, fail } from '~/lib/api';
import { handleOptions, withCors } from '~/lib/cors';

export const prerender = false;

export const OPTIONS: APIRoute = ({ request }) => handleOptions(request);

export const GET: APIRoute = async ({ request }) => {
  const wrap = (r: Response) => withCors(request, r);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drop_settings')
    .select('enabled, name, drops_at, location, shop_url, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) return wrap(fail(error.message, 500));
  if (!data) return wrap(fail('Drop settings row missing', 500));

  return wrap(
    ok({
      enabled: !!data.enabled,
      name: data.name,
      drops_at: data.drops_at,
      location: data.location,
      shop_url: data.shop_url,
      updated_at: data.updated_at,
    }),
  );
};
