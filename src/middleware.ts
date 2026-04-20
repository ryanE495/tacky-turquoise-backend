// DEV MODE: auth is disabled. Every request gets a fake admin user.
// Before going to production, restore the Supabase session check and make sure
// these paths remain publicly accessible (they handle invite/recovery callbacks):
//   /admin/login
//   /admin/set-password
//   /admin/bootstrap   (delete this file before production)
//   /admin/debug       (delete this file before production)
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'dev@local',
  };
  return next();
});
