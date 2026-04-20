// One-shot Supabase setup helper. Runs the migration and creates the storage bucket.
// Usage: SB_TOKEN=sbp_... node scripts/sb-setup.mjs
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.SB_TOKEN;
const ref = process.env.SB_REF || 'ozxbjwvwchesjgebenbv';
if (!token) {
  console.error('Set SB_TOKEN env var to your Supabase Management API token (sbp_...)');
  process.exit(1);
}

const base = `https://api.supabase.com/v1/projects/${ref}`;
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function runSql(label, sql) {
  process.stdout.write(`→ ${label}... `);
  const res = await fetch(`${base}/database/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`FAILED (${res.status})`);
    console.log(text);
    return false;
  }
  console.log('ok');
  return true;
}

async function createBucketViaSql() {
  const sql = `
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('product-images', 'product-images', true, 10485760)
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit;
  `;
  return runSql('create/upsert storage bucket "product-images"', sql);
}

async function listBuckets() {
  const res = await fetch(`${base}/database/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: "select id, public from storage.buckets order by id;" }),
  });
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  console.log(`Project: ${ref}`);

  const migrationPath = path.resolve('supabase/migrations/0001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Drop existing to make this idempotent during dev setup.
  // Tables cascade-drop their triggers; the function goes last.
  const reset = `
    drop table if exists product_images cascade;
    drop table if exists products cascade;
    drop function if exists update_updated_at() cascade;
    drop policy if exists "Public view product images" on storage.objects;
    drop policy if exists "Authenticated upload product images" on storage.objects;
    drop policy if exists "Authenticated delete product images" on storage.objects;
  `;

  const resetOk = await runSql('reset existing schema (idempotent)', reset);
  if (!resetOk) process.exit(1);

  const migrateOk = await runSql('run migration 0001_init.sql', sql);
  if (!migrateOk) process.exit(1);

  const bucketOk = await createBucketViaSql();
  if (!bucketOk) process.exit(1);

  const buckets = await listBuckets();
  if (Array.isArray(buckets)) {
    console.log('\nBuckets in project:');
    for (const b of buckets) {
      console.log(`  - ${b.id} (public=${b.public})`);
    }
  }

  console.log('\nDone. Start the dev server with `npm run dev` and visit /admin/login.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
