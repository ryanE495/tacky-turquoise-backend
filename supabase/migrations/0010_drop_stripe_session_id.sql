-- `orders.stripe_session_id` was added in the original orders migration
-- (0008) as a placeholder column, then superseded by
-- `orders.stripe_checkout_session_id` in 0009 when Stripe was actually
-- wired. The old column was never written or read by any code path and
-- was causing confusion during post-checkout spot-checks. Dropping it so
-- there's only one column to look at.
alter table orders drop column if exists stripe_session_id;
