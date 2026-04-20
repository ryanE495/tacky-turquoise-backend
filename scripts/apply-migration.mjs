// Applies a single migration file against the Supabase project via Management API.
// Usage: SB_TOKEN=sbp_... node scripts/apply-migration.mjs supabase/migrations/0002_profiles.sql
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.SB_TOKEN;
const ref = process.env.SB_REF || 'ozxbjwvwchesjgebenbv';
const file = process.argv[2];

if (!token) {
  console.error('Set SB_TOKEN env var to your Supabase Management API token (sbp_...)');
  process.exit(1);
}
if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log(`Status: ${res.status}`);
console.log(text);
if (!res.ok) process.exit(1);
