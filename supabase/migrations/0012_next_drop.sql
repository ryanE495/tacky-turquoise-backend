-- Single-row config for the storefront's "Next drop" countdown banner.
create table drop_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  name text,
  drops_at timestamptz,
  location text,
  shop_url text default '/shop',
  updated_at timestamptz not null default now()
);

insert into drop_settings (id) values (1) on conflict (id) do nothing;

create trigger drop_settings_updated_at
  before update on drop_settings
  for each row execute function update_updated_at();

alter table drop_settings enable row level security;

-- Public read so the unauthenticated storefront can fetch the countdown.
create policy "Public read drop settings"
  on drop_settings for select
  using (true);

create policy "Authenticated update drop settings"
  on drop_settings for update to authenticated
  using (true) with check (true);
