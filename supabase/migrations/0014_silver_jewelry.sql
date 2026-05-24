-- Tag products as silver jewelry so the admin can mark them and the
-- storefront can filter / badge them later. Partial index because only
-- true values are interesting to look up.
alter table products add column if not exists silver_jewelry boolean not null default false;
create index if not exists products_silver_jewelry_idx
  on products(silver_jewelry) where silver_jewelry = true;
