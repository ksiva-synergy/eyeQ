-- Phase 7 · payments on web (Razorpay): checkouts, what each payment granted, review flags,
-- the receipt email, landing-page content, and the functions that turn provider state into
-- entitlements. Additive only: the previous release never reads any of it (plan 2.4).
--
-- The web app talks to Razorpay (create, fetch, verify signatures); every entitlement value
-- is decided here, from the entity Razorpay returned (rule 1). Access is still only ever
-- has_access() over entitlements (rule 4).
set role eyeq_owner;

-- ---------------------------------------------------------------- config (rule 8)
-- The seed JSON carries the same defaults.
insert into game_config (key, value, active_from, note) values
  ('payments.subscription_grace_days', '3', '2000-01-01T00:00:00Z',
   'Days of access kept after a failed renewal while Razorpay retries the charge'),
  ('payments.subscription_total_count', '{"30": 120, "90": 40, "365": 10}', '2000-01-01T00:00:00Z',
   'Billing cycles a Razorpay subscription is created for, by the product''s duration_days (Razorpay requires a count)'),
  ('landing.coach', '{"name": "", "title": "", "bio": "", "stats": []}', '2000-01-01T00:00:00Z',
   'The coach block on public program pages; empty fields are not shown (D15)')
on conflict do nothing;

-- ---------------------------------------------------------------- profiles: the receipt email
-- Optional at sign-up; collected at checkout for the receipt. Never sent to analytics (rule 11).
alter table profiles add column billing_email citext
  check (billing_email is null or billing_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
grant update (billing_email) on profiles to eyeq_api;

-- ---------------------------------------------------------------- programs: landing content (board 15)
-- {"eyebrow", "headline", "intro", "proof": [{"value","label"}], "measurements_intro",
--  "testimonials": [{"quote","name","role"}], "includes": [text]}. Content slots the coach
-- fills (D15); nothing here is written in code.
alter table programs add column landing jsonb not null default '{}'::jsonb
  check (jsonb_typeof(landing) = 'object');

-- ---------------------------------------------------------------- checkouts
-- One row per Razorpay order or subscription we create: who, what, for how much. The
-- grant path finds the athlete and the product here, never from the client. Insert-only.
create table checkouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  product_id   uuid not null references products (id),
  kind         text not null check (kind in ('order', 'subscription')),
  scope        text not null check (scope in ('subscription', 'program', 'drill')),
  scope_id     uuid,
  provider     text not null default 'razorpay' check (provider in ('razorpay')),
  external_id  text not null,                -- order_… or sub_…
  amount_paise integer not null check (amount_paise >= 0),
  currency     text not null default 'INR',
  surface      text,                         -- where checkout started: upgrade, program, drill, landing
  created_at   timestamptz not null default now(),
  unique (provider, external_id),
  check ((scope = 'subscription') = (kind = 'subscription')),
  check (scope = 'subscription' or scope_id is not null)
);
create index checkouts_user_idx on checkouts (user_id, created_at desc);
create trigger checkouts_append_only before update or delete on checkouts
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------- payment_grants
-- Which entitlement each captured payment granted or extended. The primary key is what
-- makes a payment grant once: the webhook and the Checkout refresh race to insert it, and
-- the second waits for the first, conflicts, and does nothing. Insert-only.
create table payment_grants (
  provider         text not null check (provider in ('razorpay')),
  payment_id       text not null,            -- pay_…
  checkout_id      uuid not null references checkouts (id),
  user_id          uuid not null references profiles (id) on delete cascade,
  entitlement_id   uuid not null references entitlements (id),
  amount_paise     integer not null,
  payment_event_id uuid references payment_events (id),
  via              text not null check (via in ('webhook', 'refresh', 'sweep')),
  created_at       timestamptz not null default now(),
  primary key (provider, payment_id)
);
create index payment_grants_user_idx on payment_grants (user_id, created_at desc);
create index payment_grants_entitlement_idx on payment_grants (entitlement_id);
create trigger payment_grants_append_only before update or delete on payment_grants
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------- payment_flags
-- Things a person should look at, raised by the processor with no access change: a partial
-- refund, a dispute opened or decided, a payment that matches no checkout or the wrong amount.
create table payment_flags (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('partial_refund', 'dispute_opened', 'dispute_won', 'dispute_lost',
                                                 'dispute_closed', 'unmatched_payment', 'amount_mismatch')),
  provider         text not null default 'razorpay',
  external_id      text not null,            -- the payment, refund or dispute id
  user_id          uuid references profiles (id) on delete set null,
  payment_event_id uuid references payment_events (id),
  detail           jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid,
  unique (kind, provider, external_id)
);
create index payment_flags_open_idx on payment_flags (created_at desc) where resolved_at is null;

-- ---------------------------------------------------------------- RLS and grants
alter table checkouts enable row level security;
alter table payment_grants enable row level security;
alter table payment_flags enable row level security;
create policy api_own on checkouts for select to eyeq_api using (user_id = app_user_id());
create policy api_own_insert on checkouts for insert to eyeq_api with check (user_id = app_user_id());
create policy api_own on payment_grants for select to eyeq_api using (user_id = app_user_id());
create policy service_all on checkouts for all to eyeq_service using (true) with check (true);
create policy service_all on payment_grants for all to eyeq_service using (true) with check (true);
create policy service_all on payment_flags for all to eyeq_service using (true) with check (true);
grant select, insert on checkouts to eyeq_api;
grant select on payment_grants to eyeq_api;
grant select, insert on checkouts, payment_grants to eyeq_service;
grant select, insert, update on payment_flags to eyeq_service;

-- ---------------------------------------------------------------- provider_subscriptions (a cache)
-- The provider's own view of each subscription as last fetched, for Account ("renews on",
-- "cancelled, ends on"). Never asked before opening content: access is entitlements only
-- (rule 4). Rebuildable by fetching each subscription again.
create table provider_subscriptions (
  provider            text not null check (provider in ('razorpay')),
  external_id         text not null,          -- sub_…
  checkout_id         uuid not null references checkouts (id),
  user_id             uuid not null references profiles (id) on delete cascade,
  status              text not null,          -- Razorpay's status, as fetched
  current_start       timestamptz,
  current_end         timestamptz,
  cancel_requested_at timestamptz,            -- the athlete asked us to cancel at cycle end
  synced_at           timestamptz not null default now(),
  primary key (provider, external_id)
);
create index provider_subscriptions_user_idx on provider_subscriptions (user_id);
alter table provider_subscriptions enable row level security;
create policy api_own on provider_subscriptions for select to eyeq_api using (user_id = app_user_id());
create policy service_all on provider_subscriptions for all to eyeq_service using (true) with check (true);
grant select on provider_subscriptions to eyeq_api;
grant select, insert, update on provider_subscriptions to eyeq_service;

-- ---------------------------------------------------------------- helpers

create function rzp_ts(p jsonb, p_key text) returns timestamptz
language sql immutable as $$
  select case when jsonb_typeof(p -> p_key) = 'number' then to_timestamp((p ->> p_key)::bigint) end
$$;

-- What a first grant reports back: enough for analytics (ids and product kind, rule 11)
-- and nothing personal.
create function payment_result(c checkouts, p_entitlement_id uuid, p_payment_id text, p_granted boolean, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object('granted', p_granted, 'user_id', c.user_id, 'product_id', c.product_id,
    'product_kind', (select kind from products where id = c.product_id), 'checkout_id', c.id,
    'entitlement_id', p_entitlement_id, 'payment_id', p_payment_id) || p_extra
$$;

-- The receipt (plan 6.9 kind 'receipt'), queued in the same transaction as the grant, so it
-- is sent once per payment. Skipped without an email; the dispatcher sends it through Resend.
create function queue_receipt(c checkouts, p_payment_id text, p_amount integer, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select billing_email into v_email from profiles where id = c.user_id;
  if v_email is null then return; end if;
  perform enqueue_notification(c.user_id, 'receipt', user_local_date(c.user_id, p_at), 'receipt:razorpay:' || p_payment_id,
    jsonb_build_object('email', v_email, 'product_title', (select title from products where id = c.product_id),
      'amount_paise', p_amount, 'payment_id', p_payment_id, 'paid_at', p_at), 'email');
end $$;

create function raise_payment_flag(p_kind text, p_external_id text, p_user_id uuid, p_payment_event_id uuid, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into payment_flags (kind, external_id, user_id, payment_event_id, detail)
  values (p_kind, p_external_id, p_user_id, p_payment_event_id, p_detail)
  on conflict (kind, provider, external_id) do nothing
$$;

-- ---------------------------------------------------------------- one-time payments

-- A captured payment for one of our orders grants what the checkout bought: the program,
-- or the one pay-per-view drill (scope_id is that drill; nothing else opens). Keyed by the
-- payment id: the webhook (payment.captured, order.paid), the Checkout refresh and the
-- sweep all call this, and only the first grants. A payment that matches no checkout or
-- the wrong amount grants nothing and is flagged. Subscription charges are not handled here.
create function razorpay_payment_captured(p_payment jsonb, p_via text, p_payment_event_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay text := p_payment ->> 'id';
  c checkouts;
  e entitlements;
  g payment_grants;
begin
  if v_pay is null or p_payment ->> 'status' is distinct from 'captured' then
    return jsonb_build_object('granted', false, 'reason', 'not_captured');
  end if;
  -- the webhook and the refresh can arrive together: the second waits here, then sees the grant
  perform pg_advisory_xact_lock(hashtext('razorpay:payment:' || v_pay));
  select * into g from payment_grants where provider = 'razorpay' and payment_id = v_pay;
  if found then
    select * into c from checkouts where id = g.checkout_id;
    return payment_result(c, g.entitlement_id, v_pay, false, jsonb_build_object('reason', 'already_granted'));
  end if;
  select * into c from checkouts where provider = 'razorpay' and external_id = p_payment ->> 'order_id' and kind = 'order';
  if not found then
    if p_payment ->> 'invoice_id' is null then   -- a subscription charge carries its invoice
      perform raise_payment_flag('unmatched_payment', v_pay, null, p_payment_event_id,
        jsonb_build_object('order_id', p_payment ->> 'order_id', 'amount', p_payment -> 'amount'));
    end if;
    return jsonb_build_object('granted', false, 'reason', 'no_checkout');
  end if;
  if (p_payment ->> 'amount')::integer is distinct from c.amount_paise or p_payment ->> 'currency' is distinct from c.currency then
    perform raise_payment_flag('amount_mismatch', v_pay, c.user_id, p_payment_event_id,
      jsonb_build_object('expected', c.amount_paise, 'amount', p_payment -> 'amount', 'currency', p_payment ->> 'currency'));
    return payment_result(c, null, v_pay, false, jsonb_build_object('reason', 'amount_mismatch'));
  end if;
  e := grant_entitlement(c.user_id, c.scope, c.scope_id, 'razorpay', p_at, null, v_pay, p_payment_event_id, null, 'purchase');
  insert into payment_grants (provider, payment_id, checkout_id, user_id, entitlement_id, amount_paise, payment_event_id, via)
  values ('razorpay', v_pay, c.id, c.user_id, e.id, c.amount_paise, p_payment_event_id, p_via);
  perform queue_receipt(c, v_pay, c.amount_paise, p_at);
  return payment_result(c, e.id, v_pay, true);
end $$;

-- ---------------------------------------------------------------- subscriptions

-- Sets the athlete's Pro entitlement from the subscription as Razorpay reports it NOW (the
-- caller fetches it from the API on every subscription event), so events delivered late
-- or out of order cannot move it backwards. Writes an entitlement event only when the
-- status or end changes, so a replay changes nothing.
--   active                      -> active to current_end
--   pending (charge failing)    -> grace to current_end + payments.subscription_grace_days
--   halted, expired             -> ended now
--   cancelled, completed, paused-> active to current_end (the paid period), then the hourly
--                                  expiry sweep ends it; ended now if that is already past
--   created, authenticated      -> nothing yet (no charge)
-- p_payment, when given and captured (subscription.charged, the Checkout refresh), is
-- recorded in payment_grants once, which is what queues its receipt and reports it.
create function razorpay_subscription_sync(p_sub jsonb, p_payment jsonb, p_via text, p_payment_event_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sub text := p_sub ->> 'id';
  v_status text := p_sub ->> 'status';
  v_start timestamptz := rzp_ts(p_sub, 'current_start');
  v_end timestamptz := rzp_ts(p_sub, 'current_end');
  v_grace integer := config_int('payments.subscription_grace_days', p_at);
  c checkouts;
  e entitlements;
  v_target text;            -- active, grace, ended, or null for no entitlement yet
  v_ends timestamptz;
  v_change text := null;
  v_pay text := p_payment ->> 'id';
  v_new_payment boolean := false;
begin
  if v_sub is null then raise exception 'subscription has no id' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('razorpay:subscription:' || v_sub));
  select * into c from checkouts where provider = 'razorpay' and external_id = v_sub and kind = 'subscription';
  if not found then
    perform raise_payment_flag('unmatched_payment', v_sub, null, p_payment_event_id, jsonb_build_object('status', v_status));
    return jsonb_build_object('granted', false, 'reason', 'no_checkout');
  end if;

  insert into provider_subscriptions (provider, external_id, checkout_id, user_id, status, current_start, current_end, synced_at)
  values ('razorpay', v_sub, c.id, c.user_id, v_status, v_start, v_end, p_at)
  on conflict (provider, external_id) do update
    set status = excluded.status, current_start = excluded.current_start, current_end = excluded.current_end, synced_at = excluded.synced_at;

  if v_status = 'active' and v_end is not null then
    v_target := 'active'; v_ends := v_end;
  elsif v_status = 'pending' and v_end is not null then
    v_target := 'grace'; v_ends := v_end + make_interval(days => v_grace);
  elsif v_status in ('halted', 'expired') then
    v_target := 'ended'; v_ends := p_at;
  elsif v_status in ('cancelled', 'completed', 'paused') then
    v_ends := coalesce(v_end, rzp_ts(p_sub, 'ended_at'), p_at);
    v_target := case when v_ends > p_at then 'active' else 'ended' end;
  end if;

  select * into e from entitlements
  where user_id = c.user_id and scope = 'subscription' and source = 'razorpay' and external_ref = v_sub
  order by created_at desc limit 1 for update;

  if e.id is null then
    if v_target in ('active', 'grace') then
      e := grant_entitlement(c.user_id, 'subscription', null, 'razorpay', least(coalesce(v_start, p_at), p_at), v_ends, v_sub,
                             p_payment_event_id, null, 'subscription_' || v_status);
      if v_target = 'grace' then
        e := set_entitlement_status(e.id, 'grace', 'grace', 'subscription_pending', v_ends, p_payment_event_id, null);
      end if;
      v_change := 'granted';
    end if;
  elsif v_target is not null and (e.status is distinct from v_target or e.ends_at is distinct from v_ends) then
    if v_target = 'ended' then
      if e.status <> 'ended' then
        e := end_entitlement(e.id, 'subscription_' || v_status, least(coalesce(e.ends_at, v_ends), v_ends), p_payment_event_id);
        v_change := 'ended';
      end if;
    else
      v_change := case when e.status = 'ended' then 'reactivated' when v_target = 'grace' then 'grace' else 'extended' end;
      e := set_entitlement_status(e.id, v_target, v_change, 'subscription_' || v_status, v_ends, p_payment_event_id, null);
    end if;
  end if;

  if v_pay is not null and p_payment ->> 'status' = 'captured' and e.id is not null then
    insert into payment_grants (provider, payment_id, checkout_id, user_id, entitlement_id, amount_paise, payment_event_id, via)
    values ('razorpay', v_pay, c.id, c.user_id, e.id, (p_payment ->> 'amount')::integer, p_payment_event_id, p_via)
    on conflict do nothing;
    if found then
      v_new_payment := true;
      perform queue_receipt(c, v_pay, (p_payment ->> 'amount')::integer, p_at);
    end if;
  end if;

  return payment_result(c, e.id, v_pay, v_new_payment,
    jsonb_build_object('change', v_change, 'status', e.status, 'ends_at', e.ends_at, 'provider_status', v_status));
end $$;

-- ---------------------------------------------------------------- refunds and disputes

-- p_payment is the payment as fetched after the refund. A full refund (everything captured
-- refunded) ends what that payment granted at once; a partial refund changes no access and
-- is flagged for a person to look at.
create function razorpay_refund(p_refund jsonb, p_payment jsonb, p_payment_event_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay text := coalesce(p_payment ->> 'id', p_refund ->> 'payment_id');
  g payment_grants;
  e entitlements;
  v_full boolean := coalesce((p_payment ->> 'amount_refunded')::integer, 0) >= coalesce((p_payment ->> 'amount')::integer, 1)
                    or p_payment ->> 'refund_status' = 'full';
begin
  perform pg_advisory_xact_lock(hashtext('razorpay:payment:' || v_pay));
  select * into g from payment_grants where provider = 'razorpay' and payment_id = v_pay;
  if not v_full then
    perform raise_payment_flag('partial_refund', coalesce(p_refund ->> 'id', v_pay), g.user_id, p_payment_event_id,
      jsonb_build_object('payment_id', v_pay, 'refund_amount', p_refund -> 'amount', 'amount_refunded', p_payment -> 'amount_refunded',
                         'amount', p_payment -> 'amount'));
    return jsonb_build_object('ended', false, 'reason', 'partial');
  end if;
  if g.entitlement_id is null then return jsonb_build_object('ended', false, 'reason', 'no_grant'); end if;
  select * into e from entitlements where id = g.entitlement_id for update;
  if e.status = 'ended' then return jsonb_build_object('ended', false, 'reason', 'already_ended'); end if;
  perform end_entitlement(e.id, 'refund', p_at, p_payment_event_id, null, true);
  return jsonb_build_object('ended', true, 'entitlement_id', e.id, 'user_id', g.user_id);
end $$;

-- payment.dispute.*: opened, won and closed are flagged; lost ends what the payment granted.
create function razorpay_dispute(p_event text, p_dispute jsonb, p_payment_event_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay text := p_dispute ->> 'payment_id';
  v_id text := p_dispute ->> 'id';
  g payment_grants;
  e entitlements;
  v_kind text := case p_event when 'payment.dispute.created' then 'dispute_opened' when 'payment.dispute.won' then 'dispute_won'
                   when 'payment.dispute.lost' then 'dispute_lost' when 'payment.dispute.closed' then 'dispute_closed' end;
begin
  perform pg_advisory_xact_lock(hashtext('razorpay:payment:' || v_pay));
  select * into g from payment_grants where provider = 'razorpay' and payment_id = v_pay;
  if v_kind is not null then
    perform raise_payment_flag(v_kind, v_id, g.user_id, p_payment_event_id,
      jsonb_build_object('payment_id', v_pay, 'amount', p_dispute -> 'amount', 'phase', p_dispute ->> 'phase', 'status', p_dispute ->> 'status'));
  end if;
  if v_kind = 'dispute_lost' and g.entitlement_id is not null then
    select * into e from entitlements where id = g.entitlement_id for update;
    if e.status <> 'ended' then
      perform end_entitlement(e.id, 'chargeback', p_at, p_payment_event_id, null, true);
      return jsonb_build_object('ended', true, 'entitlement_id', e.id, 'user_id', g.user_id);
    end if;
  end if;
  return jsonb_build_object('ended', false);
end $$;

-- ---------------------------------------------------------------- the event queue

-- Stores a verified webhook once (unique on provider + event id). Returns the row id and
-- whether this delivery was new; a repeat delivery returns the stored row.
create function store_payment_event(p_provider text, p_external_id text, p_event_type text, p_payload jsonb, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v payment_events;
begin
  insert into payment_events (provider, external_id, event_type, payload, received_at)
  values (p_provider, p_external_id, p_event_type, p_payload, p_at)
  on conflict (provider, external_id) do nothing
  returning * into v;
  if found then return jsonb_build_object('id', v.id, 'new', true, 'processed', false); end if;
  select * into v from payment_events where provider = p_provider and external_id = p_external_id;
  return jsonb_build_object('id', v.id, 'new', false, 'processed', v.processed_at is not null);
end $$;

-- Events still to process: never processed, fewer than p_max attempts, received at least
-- p_min_age ago (so the sweep does not race the request that stored it).
create function payment_events_due(p_limit integer default 20, p_max integer default 10, p_min_age interval default interval '2 minutes', p_at timestamptz default now()) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from payment_events
  where processed_at is null and attempts < p_max and received_at <= p_at - p_min_age
  order by received_at limit p_limit
$$;

grant execute on function rzp_ts(jsonb, text), payment_result(checkouts, uuid, text, boolean, jsonb),
  queue_receipt(checkouts, text, integer, timestamptz), raise_payment_flag(text, text, uuid, uuid, jsonb),
  razorpay_payment_captured(jsonb, text, uuid, timestamptz), razorpay_subscription_sync(jsonb, jsonb, text, uuid, timestamptz),
  razorpay_refund(jsonb, jsonb, uuid, timestamptz), razorpay_dispute(text, jsonb, uuid, timestamptz),
  store_payment_event(text, text, text, jsonb, timestamptz), payment_events_due(integer, integer, interval, timestamptz)
  to eyeq_service;

reset role;
