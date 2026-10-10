-- Phase 1 · ledgers, entitlements, payment events, user_stats cache.
set role eyeq_owner;

create table xp_ledger (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  amount           integer not null check (amount >= 0),
  requested_amount integer not null check (requested_amount >= 0),
  truncated        boolean not null default false,
  reason           text not null check (reason in ('drill', 'session_bonus', 'personal_best', 'streak_multiplier', 'challenge', 'program_complete', 'admin')),
  source_id        uuid,
  local_date       date not null,
  created_at       timestamptz not null default now()
);
create index xp_ledger_user_day_idx on xp_ledger (user_id, local_date);
create index xp_ledger_created_idx on xp_ledger (created_at);
create index xp_ledger_user_reason_source_idx on xp_ledger (user_id, reason, source_id);
create trigger xp_ledger_append_only before update or delete on xp_ledger for each row execute function forbid_mutation();

create table coin_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  amount     integer not null check (amount <> 0),
  reason     text not null check (reason in ('level_up', 'challenge', 'badge', 'spend_freeze', 'spend_drill_unlock', 'spend_frame', 'spend_voucher', 'spend_real_world', 'refund', 'admin')),
  source_id  uuid,
  created_at timestamptz not null default now()
);
create index coin_ledger_user_idx on coin_ledger (user_id, created_at);
create trigger coin_ledger_append_only before update or delete on coin_ledger for each row execute function forbid_mutation();

create table credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  amount     integer not null check (amount <> 0),
  reason     text not null check (reason in ('purchase', 'spend', 'refund', 'admin')),
  source_id  uuid,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on credit_ledger (user_id, created_at);
create trigger credit_ledger_append_only before update or delete on credit_ledger for each row execute function forbid_mutation();

create table freeze_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  amount     integer not null check (amount in (1, -1)),
  reason     text not null check (reason in ('sub_grant', 'coin_purchase', 'used', 'refund', 'admin')),
  local_date date,                       -- the protected day for used/refund; the week for sub_grant
  source_id  uuid,
  created_at timestamptz not null default now(),
  check (reason not in ('used', 'refund') or local_date is not null)
);
create index freeze_ledger_user_idx on freeze_ledger (user_id, created_at);
create unique index freeze_ledger_one_use_per_day_idx on freeze_ledger (user_id, local_date) where reason = 'used';
create unique index freeze_ledger_one_refund_per_day_idx on freeze_ledger (user_id, local_date) where reason = 'refund';
create trigger freeze_ledger_append_only before update or delete on freeze_ledger for each row execute function forbid_mutation();

-- Balances can never go below zero. spend_coins locks the athlete's user_stats row so two
-- concurrent spends serialise; this constraint trigger is the second line of defence.
create function assert_non_negative_balance() returns trigger
language plpgsql as $$
declare v bigint;
begin
  execute format('select coalesce(sum(amount), 0) from %I where user_id = $1', tg_table_name) into v using new.user_id;
  if v < 0 then
    raise exception 'insufficient balance in % for user %', tg_table_name, new.user_id using errcode = 'P0001';
  end if;
  return null;
end $$;
create constraint trigger coin_ledger_balance after insert on coin_ledger
  deferrable initially immediate for each row execute function assert_non_negative_balance();
create constraint trigger credit_ledger_balance after insert on credit_ledger
  deferrable initially immediate for each row execute function assert_non_negative_balance();
create constraint trigger freeze_ledger_balance after insert on freeze_ledger
  deferrable initially immediate for each row execute function assert_non_negative_balance();

-- ---------------------------------------------------------------- payments

create table payment_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('razorpay', 'revenuecat')),
  external_id  text not null,
  event_type   text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  attempts     integer not null default 0,
  last_error   text,
  unique (provider, external_id)
);

-- Near-ledger: the payload never changes; only processing fields may be set.
create function payment_events_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payment_events rows are never deleted' using errcode = '42501';
  end if;
  if new.provider <> old.provider or new.external_id <> old.external_id
     or new.payload <> old.payload or new.received_at <> old.received_at
     or new.event_type is distinct from old.event_type then
    raise exception 'payment_events payload is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger payment_events_guard before update or delete on payment_events
  for each row execute function payment_events_guard();

-- ---------------------------------------------------------------- entitlements

create table entitlements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  scope        text not null check (scope in ('subscription', 'program', 'drill', 'challenge')),
  scope_id     uuid,                                   -- null for subscription
  source       text not null check (source in ('play', 'appstore', 'razorpay', 'coins', 'credits', 'admin')),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,                            -- null = lifetime
  status       text not null default 'active' check (status in ('active', 'grace', 'ended')),
  external_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (scope = 'subscription' or scope_id is not null)
);
create index entitlements_user_idx on entitlements (user_id, scope, scope_id);
create index entitlements_expiry_idx on entitlements (ends_at) where status in ('active', 'grace');

create table entitlement_events (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity,
  entitlement_id   uuid not null references entitlements (id),
  change           text not null check (change in ('granted', 'extended', 'grace', 'ended', 'revoked', 'reactivated')),
  reason           text,
  payment_event_id uuid references payment_events (id),
  admin_id         uuid,
  snapshot         jsonb not null,
  at               timestamptz not null default now()
);
create index entitlement_events_ent_idx on entitlement_events (entitlement_id, at);
create trigger entitlement_events_append_only before update or delete on entitlement_events
  for each row execute function forbid_mutation();

-- Every change to an entitlement must leave an entitlement_events row whose snapshot
-- describes the row as it now stands (rule 2). Checked at commit.
create function entitlements_require_event() returns trigger
language plpgsql as $$
declare s jsonb; cur entitlements;
begin
  -- compare the row as it stands at check time (it may have changed again since this event queued)
  select * into cur from entitlements where id = new.id;
  select snapshot into s from entitlement_events where entitlement_id = new.id order by seq desc limit 1;
  if s is null or s->>'status' is distinct from cur.status
     or (s->>'ends_at')::timestamptz is distinct from cur.ends_at
     or (s->>'starts_at')::timestamptz is distinct from cur.starts_at then
    raise exception 'entitlement % changed without a matching entitlement_events row', new.id using errcode = '42501';
  end if;
  return null;
end $$;
create constraint trigger entitlements_require_event after insert or update on entitlements
  deferrable initially deferred for each row execute function entitlements_require_event();
create trigger entitlements_no_delete before delete on entitlements
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------- user_stats (cache)

create table user_stats (
  user_id                uuid primary key references profiles (id) on delete cascade,
  total_xp               integer not null default 0,
  level                  integer not null default 1,
  current_streak         integer not null default 0,
  best_streak            integer not null default 0,
  freezes_held           integer not null default 0,
  coins                  integer not null default 0,
  credits                integer not null default 0,
  last_judged_local_date date,                         -- streak_close high-water mark
  updated_at             timestamptz not null default now()
);

reset role;
