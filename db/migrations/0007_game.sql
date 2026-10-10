-- Phase 1 · game: badges, challenges, leaderboards, rewards, promo codes.
set role eyeq_owner;

create table badges (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text not null,          -- the locked state: how to earn it
  family       text not null check (family in ('consistency', 'volume', 'mastery', 'community')),
  -- {"metric": "...", "gte": n, "tag": "...", "drill_id": "...", "value": n, "hour": n, "scope": "global"}
  rule         jsonb not null,
  coins        integer not null default 0,
  icon         text,
  evaluated_on text not null default 'completion' check (evaluated_on in ('completion', 'weekly')),
  sort         integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table user_badges (
  user_id    uuid not null references profiles (id) on delete cascade,
  badge_id   uuid not null references badges (id),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table challenges (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('weekly', 'program', 'paid')),
  title            text not null,
  description      text,
  goal             jsonb not null,     -- same shape as a badge rule, evaluated in the window
  window_start     timestamptz not null,
  window_end       timestamptz not null,
  program_id       uuid references programs (id) on delete cascade,
  reward_xp        integer not null default 0,
  reward_coins     integer not null default 0,
  badge_id         uuid references badges (id),
  entry_product_id uuid references products (id),
  created_at       timestamptz not null default now(),
  check (window_end > window_start),
  check (type <> 'program' or program_id is not null)
);
create index challenges_window_idx on challenges (window_start, window_end);

create table challenge_progress (
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  progress     numeric not null default 0,
  target       numeric not null,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table leaderboard_weekly (
  week_start     date not null,
  scope          text not null check (scope in ('global', 'sport', 'age_band')),
  scope_value    text not null default '',
  user_id        uuid not null references profiles (id) on delete cascade,
  xp             integer not null,
  rank           integer not null,
  rank_day_start integer,
  last_xp_at     timestamptz,
  is_public      boolean not null,
  final          boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (week_start, scope, scope_value, user_id)
);
create index leaderboard_weekly_rank_idx on leaderboard_weekly (week_start, scope, scope_value, rank);

create table reward_items (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  kind            text not null check (kind in ('freeze', 'drill_unlock', 'frame', 'voucher', 'real_world')),
  title           text not null,
  description     text,
  coin_price      integer not null check (coin_price >= 0),
  per_user_limit  integer,
  per_user_period text check (per_user_period in ('month', 'lifetime')),
  meta            jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  sort            integer not null default 0
);

create table user_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  item_id     uuid not null references reward_items (id),
  acquired_at timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb
);
create index user_items_user_idx on user_items (user_id);

create table redemptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  item_id        uuid not null references reward_items (id),
  coin_ledger_id uuid references coin_ledger (id),
  status         text not null default 'requested' check (status in ('requested', 'confirmed', 'fulfilled', 'cancelled')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- P1 (phase 10) shells
create table promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        citext not null unique,
  kind        text not null check (kind in ('percent', 'fixed')),
  value       integer not null check (value > 0),
  product_id  uuid references products (id),
  max_uses    integer,
  single_user uuid references profiles (id),   -- vouchers issued to one athlete
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table promo_redemptions (
  id               uuid primary key default gen_random_uuid(),
  promo_code_id    uuid not null references promo_codes (id),
  user_id          uuid not null references profiles (id) on delete cascade,
  payment_event_id uuid references payment_events (id),
  redeemed_at      timestamptz not null default now()
);

reset role;
