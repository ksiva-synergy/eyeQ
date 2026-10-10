-- Phase 1 · content: measurement tags, products, programs, modules, sessions, drills.
set role eyeq_owner;

create table measurement_tags (
  slug        text primary key,
  name        text not null,
  "group"     text not null check ("group" in ('vision', 'reaction', 'cognition')),
  sort        integer not null default 0
);

create table products (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('subscription', 'program', 'drill', 'credit_pack', 'challenge_entry')),
  title               text not null,
  price_paise         integer not null check (price_paise >= 0),   -- INR paise, tax inclusive
  currency            text not null default 'INR',
  -- What a purchase grants: {"scope": "subscription"|"program"|"drill"|"challenge"|"credits",
  --   "scope_id": uuid|null, "duration_days": int|null, "credits": int|null}
  grants              jsonb not null default '{}'::jsonb,
  play_product_id     text,
  appstore_product_id text,
  razorpay_plan_id    text,     -- subscriptions
  razorpay_item_id    text,     -- one-time
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table programs (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  description     text,
  cover_url       text,
  sport_tags      text[] not null default '{}',
  level           text,                               -- beginner, intermediate, advanced (free text, filterable)
  duration_days   integer not null check (duration_days > 0),
  -- D23: a program can be free, in the subscription, buyable once, or any mix.
  is_free         boolean not null default false,
  in_subscription boolean not null default false,
  product_id      uuid references products (id),
  completion_xp   integer check (completion_xp >= 0),  -- null -> config xp.program_complete
  min_level       integer not null default 1,           -- D9: columns exist, nothing gated in seed
  coach_line      text,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table modules (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs (id) on delete cascade,
  "order"     integer not null,
  title       text not null,
  description text,
  unlock_rule text not null default 'after_previous' check (unlock_rule in ('immediate', 'after_previous', 'on_day')),
  unlock_day  integer,
  unique (program_id, "order"),
  check (unlock_rule <> 'on_day' or unlock_day is not null)
);

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs (id) on delete cascade,
  module_id   uuid not null references modules (id) on delete cascade,
  day_number  integer not null check (day_number > 0),
  title       text,
  est_minutes integer not null default 15,
  unique (program_id, day_number)
);

create table drills (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  video_provider   text not null check (video_provider in ('youtube', 'drive', 'mux')),
  video_ref        text not null,            -- rule 5: leaves the server only through get_drill_media
  thumbnail_url    text,
  instructions     text[] not null default '{}',
  target_type      text not null default 'none' check (target_type in ('reps', 'seconds', 'none')),
  target_value     integer,
  target_label     text,
  rest_seconds     integer,
  duration_minutes integer not null default 3,
  score_type       text not null default 'none' check (score_type in ('none', 'number', 'rating')),
  score_direction  text not null default 'higher' check (score_direction in ('higher', 'lower')),
  score_unit       text,
  xp               integer check (xp >= 0),   -- null -> config xp.drill
  measurement_tag  text references measurement_tags (slug),
  access           text not null default 'included' check (access in ('included', 'free_preview', 'free_pool', 'ppv')),
  ppv_product_id   uuid references products (id),
  coin_price       integer check (coin_price >= 0),  -- null -> config coin.drill_unlock_price
  min_level        integer not null default 1,
  status           text not null default 'published' check (status in ('draft', 'published')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table session_drills (
  session_id uuid not null references sessions (id) on delete cascade,
  drill_id   uuid not null references drills (id),
  "order"    integer not null,
  primary key (session_id, drill_id),
  unique (session_id, "order")
);
create index session_drills_drill_idx on session_drills (drill_id);

-- A drill's effective XP and coin price (per-drill override or config default).
create function drill_xp(p_drill drills, p_at timestamptz default now()) returns integer
language sql stable as $$
  select coalesce(p_drill.xp, config_int('xp.drill', p_at))
$$;

reset role;
