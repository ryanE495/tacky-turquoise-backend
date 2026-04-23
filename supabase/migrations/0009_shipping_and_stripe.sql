-- Shipping settings (single row enforced via check constraint on id = 1)
create table shipping_settings (
  id integer primary key default 1 check (id = 1),
  ship_from_name text not null default 'Tacky Turquoise',
  ship_from_street1 text not null,
  ship_from_street2 text,
  ship_from_city text not null,
  ship_from_state text not null,
  ship_from_zip text not null,
  ship_from_country text not null default 'US',
  ship_from_phone text,
  ship_from_email text,
  default_length_in numeric(5,2) not null default 7.0,
  default_width_in numeric(5,2) not null default 5.0,
  default_height_in numeric(5,2) not null default 1.0,
  default_weight_oz numeric(5,2) not null default 4.0,
  updated_at timestamptz not null default now()
);

insert into shipping_settings (
  id, ship_from_street1, ship_from_city, ship_from_state, ship_from_zip
) values (
  1, '9046 High Mesa Rd', 'Olathe', 'CO', '81425'
) on conflict (id) do nothing;

create trigger shipping_settings_updated_at
  before update on shipping_settings
  for each row execute function update_updated_at();

-- Stripe + Shippo columns on orders (additive — existing columns untouched)
alter table orders add column if not exists stripe_checkout_session_id text unique;
alter table orders add column if not exists shippo_rate_id text;
alter table orders add column if not exists shipping_service_level text;
alter table orders add column if not exists shipping_estimated_days integer;

create index if not exists orders_stripe_session_idx on orders(stripe_checkout_session_id);

-- RLS
alter table shipping_settings enable row level security;

create policy "Authenticated can read shipping settings"
  on shipping_settings for select to authenticated using (true);

create policy "Authenticated can update shipping settings"
  on shipping_settings for update to authenticated using (true) with check (true);
