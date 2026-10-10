-- Phase 1 · people: profiles, admins, self ratings, push tokens, notifications outbox, rate limits.
set role eyeq_owner;

create table profiles (
  id               uuid primary key,          -- = auth user id; FK added in phase 2
  display_name     text not null,
  avatar_url       text,                      -- D22: initials at launch; column kept
  sport            text,
  playing_level    text check (playing_level in ('school', 'club', 'district', 'state', 'national')),
  dob              date,                      -- never leaves the server (rule 11)
  goal             text,
  session_minutes  integer not null default 15 check (session_minutes in (10, 15, 20)),
  timezone         text not null default 'Asia/Kolkata',
  visibility       text not null default 'public' check (visibility in ('public', 'private')),
  reminder_time    time not null default '19:00',
  notify_daily     boolean not null default true,
  notify_streak    boolean not null default true,
  notify_challenge boolean not null default true,
  notify_recap     boolean not null default true,
  notify_overtaken boolean not null default true,
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_sport_idx on profiles (sport);

-- Minors default to private on boards (plan 6.6, D11). Enforced at insert when no
-- explicit visibility is given.
create function profiles_default_visibility() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and is_minor(new.dob) then
    new.visibility := 'private';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_before_write before insert or update on profiles
  for each row execute function profiles_default_visibility();

create table admins (
  user_id    uuid primary key references profiles (id) on delete cascade,
  role       text not null check (role in ('coach', 'owner')),
  created_at timestamptz not null default now()
);

create function is_admin(p_user_id uuid default app_user_id()) returns boolean
language sql stable as $$
  select exists (select 1 from admins where user_id = p_user_id)
$$;

create table self_ratings (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles (id) on delete cascade,
  area      text not null check (area in ('focus', 'reaction', 'tracking')),
  rating    integer not null check (rating between 1 and 5),
  kind      text not null check (kind in ('baseline', 'day14', 'day21', 'adhoc')),
  taken_at  timestamptz not null default now()
);
create index self_ratings_user_idx on self_ratings (user_id, taken_at desc);

create table push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  token        text not null unique,
  platform     text not null check (platform in ('android', 'ios', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at  timestamptz
);
create index push_tokens_user_idx on push_tokens (user_id);

-- Outbox the worker drains (plan 5.2, 6.9). Text is rendered by the worker from
-- kind + data through packages/i18n, so nothing user-facing is stored here.
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  kind        text not null check (kind in ('daily_reminder', 'streak_at_risk', 'challenge_ending', 'weekly_recap', 'overtaken', 'receipt')),
  channel     text not null default 'push' check (channel in ('push', 'email', 'inapp')),
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  status      text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  local_date  date not null,
  send_after  timestamptz not null default now(),
  attempts    integer not null default 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_queue_idx on notifications (status, send_after) where status = 'queued';
create index notifications_user_day_idx on notifications (user_id, local_date);

-- Rate limits that hold across replicas (plan 5.2). Fixed windows.
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

-- Increments the counter for the current window and returns true while under the limit.
create function check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into rate_limits (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;
  -- opportunistic cleanup of old windows for this key
  delete from rate_limits where key = p_key and window_start < v_window - make_interval(secs => p_window_seconds * 2);
  return v_count <= p_limit;
end $$;

reset role;
