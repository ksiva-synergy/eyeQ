-- Phase 1 · foundation: roles, helpers, game_config, audit_log.
-- Plan 5.3: eyeq_owner owns everything; eyeq_api is the athlete login role;
-- eyeq_service is the login role for webhooks, the worker and admin routes.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'eyeq_owner') then
    create role eyeq_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'eyeq_api') then
    create role eyeq_api login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'eyeq_service') then
    create role eyeq_service login;
  end if;
end $$;

-- The migration user (postgres locally, the server admin in Azure) acts as eyeq_owner
-- from the next migration on: the runner issues SET ROLE eyeq_owner when it can.
grant eyeq_owner to current_user;
grant usage, create on schema public to eyeq_owner;
grant usage on schema public to eyeq_api, eyeq_service;

-- Nothing is callable or readable unless a later migration says so.
alter default privileges for role eyeq_owner revoke execute on functions from public;
alter default privileges for role eyeq_owner revoke all on tables from public;

-- Let eyeq_owner own the objects of this migration too.
set role eyeq_owner;

-- ---------------------------------------------------------------- helpers

-- The athlete of the current request. Every athlete request begins with
-- set_config('app.user_id', <id>, true); policies and game functions read it here.
create function app_user_id() returns uuid
language sql stable parallel safe as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create function require_user_id() returns uuid
language plpgsql stable as $$
declare v uuid := app_user_id();
begin
  if v is null then
    raise exception 'no athlete in context (app.user_id is not set)' using errcode = '28000';
  end if;
  return v;
end $$;

create function local_date(p_ts timestamptz, p_tz text) returns date
language sql immutable parallel safe as $$
  select (p_ts at time zone coalesce(p_tz, 'Asia/Kolkata'))::date
$$;

create function local_time(p_ts timestamptz, p_tz text) returns time
language sql immutable parallel safe as $$
  select (p_ts at time zone coalesce(p_tz, 'Asia/Kolkata'))::time
$$;

-- Start of a local day as an absolute instant.
create function local_day_start(p_date date, p_tz text) returns timestamptz
language sql immutable parallel safe as $$
  select (p_date::timestamp) at time zone coalesce(p_tz, 'Asia/Kolkata')
$$;

-- ISO week Monday for an instant in IST (plan 6.6: boards reset Monday 00:00 IST).
create function ist_week_start(p_ts timestamptz) returns date
language sql immutable parallel safe as $$
  select date_trunc('week', (p_ts at time zone 'Asia/Kolkata'))::date
$$;

create function is_minor(p_dob date, p_on date default current_date) returns boolean
language sql immutable parallel safe as $$
  select p_dob is not null and p_dob + interval '18 years' > p_on
$$;

-- Round half up, as the XP multiplier rule requires (71.5 -> 72).
create function round_half_up(p numeric) returns integer
language sql immutable parallel safe as $$
  select floor(p + 0.5)::integer
$$;

-- Ground rule 2: ledgers are append-only. Attach as BEFORE UPDATE OR DELETE.
create function forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only; write a correcting row instead', tg_table_name
    using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- config

-- Ground rule 8: every rule value lives here. A change is a new row with a later
-- active_from; readers pick the newest row active at the moment they ask about.
create table game_config (
  key         text not null,
  value       jsonb not null,
  active_from timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now(),
  primary key (key, active_from)
);

create function config_value(p_key text, p_at timestamptz default now()) returns jsonb
language sql stable as $$
  select value from game_config
  where key = p_key and active_from <= p_at
  order by active_from desc limit 1
$$;

create function config_int(p_key text, p_at timestamptz default now()) returns integer
language plpgsql stable as $$
declare v jsonb := config_value(p_key, p_at);
begin
  if v is null then raise exception 'game_config has no value for %', p_key; end if;
  return (v #>> '{}')::integer;
end $$;

create function config_num(p_key text, p_at timestamptz default now()) returns numeric
language plpgsql stable as $$
declare v jsonb := config_value(p_key, p_at);
begin
  if v is null then raise exception 'game_config has no value for %', p_key; end if;
  return (v #>> '{}')::numeric;
end $$;

create function config_text(p_key text, p_at timestamptz default now()) returns text
language plpgsql stable as $$
declare v jsonb := config_value(p_key, p_at);
begin
  if v is null then raise exception 'game_config has no value for %', p_key; end if;
  return v #>> '{}';
end $$;

-- ---------------------------------------------------------------- audit

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_role  text not null,                 -- athlete, coach, owner, system, script
  action      text not null,
  target_type text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_target_idx on audit_log (target_type, target_id, created_at desc);
create trigger audit_log_append_only before update or delete on audit_log
  for each row execute function forbid_mutation();

reset role;
