// Real auth: every /admin/* page and /api/admin/* endpoint requires a
// Supabase session. Routes in PUBLIC_ADMIN_PATHS are explicit exemptions
// for the login screen and invite/recovery callbacks.
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase/server';

const ADMIN_PREFIX = '/admin';
const ADMIN_API_PREFIX = '/api/admin';
const LOGIN_PATH = '/admin/login';

const PUBLIC_ADMIN_PATHS = new Set<string>([
  LOGIN_PATH,
  '/admin/set-password',
  // Recovery escape hatches — DELETE THESE FILES + REMOVE FROM THIS LIST
  // before the storefront opens to actual customers.
  '/admin/bootstrap',
  '/admin/debug',
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const needsAdminSession =
    (pathname.startsWith(ADMIN_PREFIX) && !PUBLIC_ADMIN_PATHS.has(pathname)) ||
    pathname.startsWith(ADMIN_API_PREFIX);

  context.locals.user = null;

  if (!needsAdminSession) {
    return next();
  }

  const supabase = createSupabaseServerClient({
    cookies: context.cookies,
    request: context.request,
  });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    if (pathname.startsWith(ADMIN_API_PREFIX)) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const redirectTo = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`${LOGIN_PATH}?next=${redirectTo}`);
  }

  context.locals.user = { id: data.user.id, email: data.user.email ?? null };
  return next();
});
