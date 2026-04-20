# Tacky Turquoise — Backend (Phase 1)

Astro SSR app that provides:

- A **public JSON API** for the storefront (`GET /api/products`, `GET /api/products/[slug]`).
- An **admin CMS** at `/admin` for managing one-of-a-kind products + images.
- **Supabase** for Postgres, Auth (cookie-based via `@supabase/ssr`), and Storage.

Phase 1 is **product management only**. Checkout, orders, webhooks, shipping, and email come in phase 2.

---

## 1. Environment variables

Copy `.env.example` to `.env` and fill in the values from your Supabase project (Settings → API):

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` are safe to expose to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It bypasses RLS and is used exclusively in `src/lib/supabase/admin.ts` for admin mutations. Never import that file from code that ships to the browser.

For Netlify deployment, set the same three variables in Site settings → Environment variables.

---

## 2. Install and run

```
npm install
npm run dev
```

Dev server runs at http://localhost:4321. The admin UI is at http://localhost:4321/admin.

---

## 3. Run the migration

The schema, RLS policies, and storage policies live in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

**Recommended (Supabase CLI):**

```
supabase link --project-ref <project-ref>
supabase db push
```

**Manual:** open the Supabase dashboard → SQL editor → paste the contents of `0001_init.sql` → Run.

The migration creates:

- `products` and `product_images` tables (+ indexes + `updated_at` trigger)
- RLS policies allowing public SELECT for `published`/`sold` rows and full access for authenticated users
- Storage policies on the `product-images` bucket

---

## 4. Create the storage bucket

The migration assumes a bucket named **`product-images`** already exists. Create it in the dashboard:

1. Storage → **New bucket**
2. Name: `product-images`
3. **Public bucket**: yes (public read enabled)
4. File size limit: 10 MB (optional, matches the client-side cap)

Path convention used by the uploader: `product-images/{product_id}/{uuid}.{ext}`.

---

## 5. Create the admin user

There is **no public sign-up**. Create the admin user manually:

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**
2. Use email + password. Leave "Send magic link" off; choose a password directly.
3. **Auto-confirm the user** (toggle "Auto Confirm User" on) so they can log in immediately.

That user can now sign in at `/admin/login`. Any authenticated user is treated as admin — there is no role system yet.

---

## 6. Seed a test product (optional)

Easiest path: log in to `/admin`, click **New Product**, fill in:

- Title: `Royston Lightning Cuff`
- Price: `320`
- Status: `Published`
- Turquoise type: `Royston`
- Metal: `Sterling Silver`

On save you'll be redirected to the image uploader. Drop in a JPG, set alt text, done.

If you'd rather seed via SQL (from the Supabase SQL editor):

```sql
insert into products (slug, title, description, price_cents, status, turquoise_type, metal)
values (
  'royston-lightning-cuff',
  'Royston Lightning Cuff',
  'One-of-a-kind sterling cuff with a bolt of Royston turquoise.',
  32000,
  'published',
  'Royston',
  'Sterling Silver'
);
```

Images seeded by SQL also need a matching file uploaded to the `product-images` bucket at the `storage_path` you reference.

---

## 7. Verify the public API

```
curl http://localhost:4321/api/products
curl http://localhost:4321/api/products/royston-lightning-cuff
```

Both return `{ "ok": true, "data": … }`. Draft/archived products are never returned. Sold products **are** returned (frontend uses the `status` field to render a "SOLD" overlay).

---

## 8. Settings + user management (phase 1.5)

After [supabase/migrations/0002_profiles.sql](supabase/migrations/0002_profiles.sql) is applied (see below), `/admin/settings` shows the settings hub and `/admin/settings/users` handles admin accounts — invite by email, edit display name, resend invites, force password resets, delete.

### Apply the profiles migration

If you ran `npm install` and have a Supabase Management API token, the easiest way:

```
SB_TOKEN=sbp_... node scripts/apply-migration.mjs supabase/migrations/0002_profiles.sql
```

Otherwise, paste `supabase/migrations/0002_profiles.sql` into the Supabase SQL editor and run.

The migration creates `profiles`, a trigger that auto-creates a profile row whenever `auth.users` gets a new row, and backfills profiles for any users created before phase 1.5.

### Supabase auth redirect configuration (required for invite + reset links)

Invite and recovery emails contain a link back to your app. For those links to land correctly:

1. Supabase dashboard → **Authentication → URL Configuration**
2. **Site URL**: set to your deployed origin (e.g. `https://tackyturquoise.com`). For local-only testing, `http://localhost:4321` works.
3. **Redirect URLs**: add both:
   - `http://localhost:4321/admin/set-password`
   - `https://<your-production-domain>/admin/set-password`

Without these, Supabase rejects the `redirectTo` param and the user lands on the Supabase-hosted fallback.

### Email templates (optional)

Invite / password reset emails come from Supabase's default templates. To match your brand:

Supabase dashboard → **Authentication → Email Templates** → customize **Invite user** and **Reset password**. Any `{{ .ConfirmationURL }}` / `{{ .SiteURL }}` tokens stay intact — the link still routes through `/admin/set-password`.

### User management flow

1. Owner signs in, opens **Settings → Users**, enters an email (+ optional display name), clicks **Send invite**.
2. Supabase emails the invitee a magic link → lands on `/admin/set-password`.
3. Invitee sets a password, gets redirected to `/admin`.
4. From the Users list the owner can resend pending invites, force password resets on active users, edit display names, change other users' emails, or delete accounts (typed-email confirmation required).
5. Self-protections: you cannot delete yourself, and you cannot change your own email from this UI — the API enforces both regardless of the UI state.

---

## File map

```
supabase/migrations/
  0001_init.sql                        products schema + RLS + storage policies
  0002_profiles.sql                    profiles table + auto-create trigger + backfill
scripts/
  sb-setup.mjs                         idempotent full setup (migration + bucket)
  apply-migration.mjs                  apply a single migration file
astro.config.mjs                       SSR + Netlify adapter
src/middleware.ts                      protects /admin/* and /api/admin/* (dev-bypass mode)
src/lib/supabase/
  client.ts                            browser client (anon key)
  server.ts                            cookie-bound server client (anon key)
  admin.ts                             service-role client (SERVER ONLY)
  types.ts                             shared Product / ProductImage types
src/lib/
  slug.ts                              kebab-case slug + uniqueness
  validate-product.ts                  server-side product input validator
  users.ts                             list/fetch admin users + email validation
  format.ts                            relative-time helper
  images.ts                            storage URL helper
  api.ts                               { ok, fail } JSON response helpers
src/pages/api/products/                public API (list + by slug)
src/pages/api/admin/products/          admin API (CRUD + mark-sold + images)
src/pages/api/admin/users/             admin user API (list, invite, patch, delete, resend, reset)
src/pages/admin/                       login, dashboard, new, edit, images, set-password
src/pages/admin/settings/              settings hub + users list + user edit page
src/components/admin/                  AdminNav, SettingsNav, ProductList, ProductForm,
                                       ImageUploader, UserList, InviteUserForm, EditUserForm
src/layouts/AdminLayout.astro          shared admin chrome + global styles
```

---

## Not in phase 1 / 1.5

- Stripe / checkout / cart / orders / customers
- Transactional email beyond Supabase's built-in auth emails
- Shipping integration
- Webhooks
- Public-facing auth / customer accounts
- Role system (flat admin access is intentional — 2–5 users total)
- User activity logs / audit trail
- 2FA UI (Supabase has it built in if ever needed)
- Profile photos

All of that lands in phase 2.
