-- NOTE: spec labelled this 0003; the local 0003 slot was already taken by
-- 0003_fix_profiles_trigger.sql, so this landed as 0004.

-- Piece ID sequence (N-001, N-002, ...)
create sequence if not exists piece_id_seq start 1;

-- New columns
alter table products add column piece_id text unique;
alter table products add column cost_cents integer check (cost_cents >= 0);
alter table products add column bead_size text;
alter table products add column featured boolean not null default false;
alter table products add column published_at timestamptz;

-- Rename dimensions -> length
alter table products rename column dimensions to length;

-- Auto-generate piece_id on insert if not provided
create or replace function set_piece_id()
returns trigger as $$
begin
  if new.piece_id is null then
    new.piece_id := 'N-' || lpad(nextval('piece_id_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger products_set_piece_id
  before insert on products
  for each row execute function set_piece_id();

-- Auto-set published_at first time status becomes 'published'
create or replace function set_published_at()
returns trigger as $$
begin
  if new.status = 'published' and old.status <> 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger products_set_published_at
  before update on products
  for each row execute function set_published_at();

-- Backfill piece_ids for existing rows
do $$
declare r record;
begin
  for r in select id from products where piece_id is null order by created_at loop
    update products set piece_id = 'N-' || lpad(nextval('piece_id_seq')::text, 3, '0') where id = r.id;
  end loop;
end $$;

-- Now enforce not-null on piece_id
alter table products alter column piece_id set not null;

-- Backfill published_at for existing published/sold rows
update products set published_at = created_at where status in ('published','sold') and published_at is null;

create index products_featured_idx on products(featured) where featured = true;
create index products_published_at_idx on products(published_at desc);
