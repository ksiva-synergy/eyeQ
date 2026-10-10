-- Phase 1 · activity: enrollments, drill and session completions.
set role eyeq_owner;

create table enrollments (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references profiles (id) on delete cascade,
  program_id                uuid not null references programs (id),
  started_at                timestamptz not null default now(),
  start_local_date          date not null,
  current_day               integer not null default 1,
  last_completed_local_date date,
  last_completed_session_id uuid references sessions (id),
  completed_at              timestamptz,
  is_active                 boolean not null default true,
  unique (user_id, program_id)
);
create unique index enrollments_one_active_idx on enrollments (user_id) where is_active;

create table drill_completions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles (id) on delete cascade,
  drill_id        uuid not null references drills (id),
  session_id      uuid references sessions (id),      -- null for the daily free drill
  completed_at    timestamptz not null,               -- device time
  received_at     timestamptz not null default now(),
  local_date      date not null,                      -- of completed_at in the athlete's timezone
  watch_pct       numeric(5, 4) check (watch_pct between 0 and 1),
  score           numeric,
  client_event_id text not null,
  result          jsonb,                              -- stored complete_drill result (idempotency)
  unique (user_id, client_event_id)
);
create index drill_completions_user_day_idx on drill_completions (user_id, local_date);
create index drill_completions_user_drill_idx on drill_completions (user_id, drill_id, completed_at);

-- The streak fact: one per athlete per local day (plan 5.1).
create table session_completions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  session_id        uuid references sessions (id),
  free_drill_id     uuid references drills (id),
  local_date        date not null,
  completed_at      timestamptz not null,
  counts_for_streak boolean not null default true,    -- false when synced more than 48 h late
  unique (user_id, local_date),
  check (session_id is not null or free_drill_id is not null)
);
create index session_completions_session_idx on session_completions (user_id, session_id);

reset role;
