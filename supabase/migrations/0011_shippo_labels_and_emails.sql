-- NOTE: spec labelled this 0010; renumbered to 0011 because 0010 was
-- already used by 0010_drop_stripe_session_id.sql.

-- Add label-related columns to orders
alter table orders add column if not exists label_url text;
alter table orders add column if not exists label_created_at timestamptz;
alter table orders add column if not exists shippo_rate_id_used text;

-- Email delivery log for debugging (best-effort — these don't block order state)
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  email_type text not null check (email_type in ('order_confirmation', 'shipping_notification')),
  recipient text not null,
  resend_id text,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz not null default now()
);

create index if not exists email_log_order_id_idx on email_log(order_id);
create index if not exists email_log_sent_at_idx on email_log(sent_at desc);

alter table email_log enable row level security;

drop policy if exists "Authenticated can read email log" on email_log;
create policy "Authenticated can read email log"
  on email_log for select to authenticated using (true);
