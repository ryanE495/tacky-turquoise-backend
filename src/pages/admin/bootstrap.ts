// One-time helper to create a first admin user without using the Supabase dashboard.
// Visit /admin/bootstrap in the browser. Delete this file before going to production.
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '~/lib/supabase/admin';

export const prerender = false;

const EMAIL = 'admin@tackyturquoise.local';
const PASSWORD = 'turquoise123';

export const GET: APIRoute = async () => {
  const supabase = createSupabaseAdminClient();

  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    return html(500, `<h1>Bootstrap failed</h1><pre>${escape(listErr.message)}</pre>`);
  }

  const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL);

  if (existing) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updateErr) {
      return html(500, `<h1>Bootstrap failed (update)</h1><pre>${escape(updateErr.message)}</pre>`);
    }
    return html(
      200,
      page(
        'Admin password reset',
        `<p>The user already existed; its password has been reset. Log in with:</p>
         <ul>
           <li><strong>Email:</strong> ${EMAIL}</li>
           <li><strong>Password:</strong> ${PASSWORD}</li>
         </ul>
         <p><a href="/admin/login">Go to login →</a></p>`,
      ),
    );
  }

  const { error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createErr) {
    return html(500, `<h1>Bootstrap failed (create)</h1><pre>${escape(createErr.message)}</pre>`);
  }

  return html(
    200,
    page(
      'Admin user created',
      `<p>You can now log in with:</p>
       <ul>
         <li><strong>Email:</strong> ${EMAIL}</li>
         <li><strong>Password:</strong> ${PASSWORD}</li>
       </ul>
       <p><strong>Change this password</strong> in the Supabase dashboard after first login, and delete <code>src/pages/admin/bootstrap.ts</code>.</p>
       <p><a href="/admin/login">Go to login →</a></p>`,
    ),
  );
};

function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 560px; margin: 3rem auto; padding: 0 1rem; line-height: 1.55; color: #1a1a1a; }
    h1 { font-size: 1.3rem; }
    code { background: #eee; padding: 0.1rem 0.3rem; border-radius: 3px; }
    a { color: #1f6f6a; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}

function html(status: number, body: string) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}
