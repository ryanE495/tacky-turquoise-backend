-- NOTE: spec labelled this 0004_orders.sql; renumbered to 0008 because
-- 0004 was taken by 0004_necklace_fields.sql. No semantic difference.

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  status text not null default 'pending' check (status in (
    'pending',
    'paid',
    'shipped',
    'delivered',
    'refunded',
    'cancelled',
    'failed'
  )),

  -- Customer (captured at checkout, no accounts required)
  customer_email text not null,
  customer_name text not null,
  customer_phone text,

  -- Shipping address (denormalized snapshot at time of order)
  ship_to_name text not null,
  ship_to_line1 text not null,
  ship_to_line2 text,
  ship_to_city text not null,
  ship_to_state text not null,
  ship_to_postal_code text not null,
  ship_to_country text not null default 'US',

  -- Money (all cents)
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),

  -- Payment (Stripe fields, null until integrated)
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,

  -- Fulfillment
  shippo_transaction_id text,
  tracking_number text,
  tracking_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,

  -- Internal
  customer_notes text,
  admin_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

create index orders_status_idx on orders(status);
create index orders_customer_email_idx on orders(customer_email);
create index orders_created_at_idx on orders(created_at desc);

-- Order number sequence (e.g., TC-1001, TC-1002)
create sequence if not exists order_number_seq start 1001;

create or replace function set_order_number()
returns trigger as $$
begin
  if new.order_number is null then
    new.order_number := 'TC-' || nextval('order_number_seq')::text;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger orders_set_order_number
  before insert on orders
  for each row execute function set_order_number();

-- Order items (one row per product in the order)
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,

  -- Snapshot at time of order (so historical orders don't change if product edits)
  product_title text not null,
  product_piece_id text not null,
  product_slug text not null,
  price_cents integer not null check (price_cents >= 0),
  primary_image_path text,

  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on order_items(order_id);
create index order_items_product_id_idx on order_items(product_id);

-- RLS
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "Authenticated can read orders"
  on orders for select to authenticated using (true);

create policy "Authenticated can update orders"
  on orders for update to authenticated using (true) with check (true);

create policy "Authenticated can read order items"
  on order_items for select to authenticated using (true);
