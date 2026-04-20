-- Drop attribute columns that are no longer part of the product model.
-- `length`, `piece_id`, `cost_cents`, `featured`, etc. are kept.
alter table products drop column if exists bead_size;
alter table products drop column if exists turquoise_type;
alter table products drop column if exists metal;
alter table products drop column if exists stone_origin;
alter table products drop column if exists weight_oz;
