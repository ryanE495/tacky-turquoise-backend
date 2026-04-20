// Inspect current auth + profiles state via Management API.
const token = process.env.SB_TOKEN;
const ref = process.env.SB_REF || 'ozxbjwvwchesjgebenbv';
if (!token) { console.error('SB_TOKEN required'); process.exit(1); }
const base = `https://api.supabase.com/v1/projects/${ref}`;

async function q(sql) {
  const res = await fetch(`${base}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

async function show(label, sql) {
  console.log(`\n--- ${label} ---`);
  const { status, body } = await q(sql);
  console.log(`status=${status}`);
  console.log(body);
}

await show('auth.users (id, email, confirmed)',
  `select id, email, email_confirmed_at, created_at from auth.users order by created_at;`);

await show('public.profiles rows',
  `select id, display_name, created_at from public.profiles order by created_at;`);

await show('handle_new_user function exists',
  `select proname, prosecdef from pg_proc where proname in ('handle_new_user','update_updated_at');`);

await show('triggers on auth.users and public.profiles',
  `select event_object_schema || '.' || event_object_table as table, trigger_name, event_manipulation, action_timing
   from information_schema.triggers
   where event_object_schema in ('auth','public')
   order by event_object_schema, event_object_table, trigger_name;`);
