// Direct test: create a user via service role, see if the trigger succeeds.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const url = env.PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const target = process.argv[2] || 'test-trigger@example.com';

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: target,
    email_confirm: true,
    password: 'TestPassword123!',
    user_metadata: { display_name: 'Trigger Test' },
  }),
});

console.log('status:', res.status);
console.log(await res.text());
