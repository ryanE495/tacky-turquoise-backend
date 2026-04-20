-- Products
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  status text not null default 'draft' check (status in ('draft','published','sold','archived')),
  turquoise_type text,
  metal text,
  stone_origin text,
  dimensions text,
  weight_oz numeric(6,2),
  meta_description text,
  sold_at timestamptz,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_status_idx on products(status);
create index products_slug_idx on products(slug);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

-- Product images (separate table so we can reorder + add alt text)
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_id_idx on product_images(product_id);

-- RLS
alter table products enable row level security;
alter table product_images enable row level security;

create policy "Public read published/sold products"
  on products for select
  using (status in ('published','sold'));

create policy "Public read images for public products"
  on product_images for select
  using (exists (
    select 1 from products
    where products.id = product_images.product_id
      and products.status in ('published','sold')
  ));

create policy "Authenticated full access products"
  on products for all to authenticated
  using (true) with check (true);

create policy "Authenticated full access images"
  on product_images for all to authenticated
  using (true) with check (true);

-- Storage policies (bucket `product-images` must be created in the dashboard first with public read enabled)
create policy "Public view product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "Authenticated upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "Authenticated delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images');
