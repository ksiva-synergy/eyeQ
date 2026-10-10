-- Phase 2 · sign-in and the API skeleton (Supabase Auth, D28).
--  1. profiles.id references auth.users(id).
--  2. Profile and user_stats rows are created on first sign-in.
--  3. Plumbing for /api/v1: rate limits, idempotency keys, profile timestamps.
--  4. pnpm admin:grant writes admins and audit_log through one function.
--  5. Supabase's anon and authenticated roles cannot even see the public schema.

-- ---------------------------------------------------------------- 1. auth.users
-- On Supabase, auth.users belongs to Supabase Auth and is never migrated here. Local
-- compose and CI's plain Postgres have no auth schema, so they get a stand-in with the
-- columns this repo reads (id, phone, email) so the foreign key and tests are the same.
do $$
begin
  if to_regclass('auth.users') is null then
    create schema if not exists auth;
    create table auth.users (
      id         uuid primary key,
      phone      text unique,
      email      text,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- Created as the migration user, not eyeq_owner: on Supabase, postgres holds REFERENCES
-- on auth.users (without grant option) and is a member of eyeq_owner, which owns profiles.
-- NOT VALID first: the hosted demo athletes from the phase 1 seed have no auth user.
-- Validated at once where every profile has one (every fresh database).
-- No ON DELETE action: an auth user with a profile cannot be deleted until account
-- deletion (phase 10) anonymises their rows; ledgers are append-only.
alter table profiles add constraint profiles_id_fkey foreign key (id) references auth.users (id) not valid;
do $$
begin
  if not exists (select 1 from profiles p where not exists (select 1 from auth.users u where u.id = p.id)) then
    alter table profiles validate constraint profiles_id_fkey;
  end if;
end $$;

-- ---------------------------------------------------------------- 5. Data API lockout
-- 0013 removed object grants. Supabase still lets anon and authenticated use the public
-- schema through PUBLIC's USAGE, and functions owned by supabase_admin (citext) keep
-- PUBLIC EXECUTE that postgres cannot revoke. Without USAGE on the schema neither role
-- can reach any table or call any function in it, whoever owns the object. Every role
-- that does need the schema gets USAGE explicitly. On plain Postgres this removes the
-- same PUBLIC grant and changes nothing else.
revoke usage on schema public from public;
grant usage on schema public to eyeq_owner, eyeq_api, eyeq_service;
grant usage on schema public to current_user;
do $$
declare r text;
begin
  -- Supabase roles that keep their explicit USAGE (platform features, never the Data API).
  foreach r in array array['service_role', 'supabase_admin', 'dashboard_user'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema public from %I', r);
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges for role eyeq_owner in schema public revoke all on tables from %I', r);
      execute format('alter default privileges for role eyeq_owner in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges for role eyeq_owner in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

set role eyeq_owner;

-- ---------------------------------------------------------------- 2. first sign-in
-- Idempotent: creates the profile (display name from the provider when known, else
-- empty until onboarding asks for it) and the user_stats cache row.
create function ensure_profile_for(p_user_id uuid, p_display_name text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_created boolean := false;
begin
  if p_user_id is null then
    raise exception 'ensure_profile_for needs a user id' using errcode = '22004';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    insert into profiles (id, display_name) values (p_user_id, coalesce(left(btrim(p_display_name), 40), ''))
    on conflict (id) do nothing;
    v_created := found;
  end if;
  perform ensure_user_stats(p_user_id);
  return v_created;
end $$;

-- The athlete-facing form: acts only for app.user_id.
create function ensure_my_profile(p_display_name text default null) returns boolean
language sql security definer set search_path = public as $$
  select ensure_profile_for(require_user_id(), p_display_name)
$$;

-- profiles.updated_at follows every change (eyeq_api has no grant on the column).
create function profiles_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on profiles for each row execute function profiles_touch();

-- ---------------------------------------------------------------- 3a. rate limits
-- New rule value (rule 8). The seed JSON carries the same default.
insert into game_config (key, value, active_from, note)
values ('rate.api_per_user_per_minute', '120', '2000-01-01T00:00:00Z', 'Every /api/v1 call, per athlete')
on conflict do nothing;

-- One counter per rule and subject in fixed windows (plan 5.2). Limits come from
-- game_config; the caller names a rule, never a number. Called in its own short
-- transaction so a refused or failed request still counts.
create function rate_limit_hit(p_rule text, p_subject text, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit  integer;
  v_window integer;
  v_start  timestamptz;
  v_key    text;
  v_count  integer;
begin
  if p_subject is null or btrim(p_subject) = '' then
    raise exception 'rate limit % needs a subject', p_rule using errcode = '22004';
  end if;
  case p_rule
    when 'otp_phone'     then v_limit := config_int('rate.otp_per_phone_per_hour', p_at);           v_window := 3600;
    when 'otp_sms_phone' then v_limit := config_int('rate.otp_per_phone_per_hour', p_at);           v_window := 3600;
    when 'otp_ip'        then v_limit := config_int('rate.otp_per_ip_per_hour', p_at);              v_window := 3600;
    when 'completions'   then v_limit := config_int('rate.completions_per_user_per_minute', p_at);  v_window := 60;
    when 'api_user'      then v_limit := config_int('rate.api_per_user_per_minute', p_at);          v_window := 60;
    else raise exception 'unknown rate-limit rule %', p_rule using errcode = '22023';
  end case;
  v_start := to_timestamp(floor(extract(epoch from p_at) / v_window) * v_window);
  v_key := p_rule || ':' || p_subject;
  insert into rate_limits (key, window_start, count) values (v_key, v_start, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;
  delete from rate_limits where key = v_key and window_start < v_start - make_interval(secs => v_window * 2);
  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'limit', v_limit,
    'count', v_count,
    'retry_after', case when v_count <= v_limit then 0
                        else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => v_window) - p_at))))::integer end
  );
end $$;

-- ---------------------------------------------------------------- 3b. idempotency keys
-- Rule 6 for /api/v1: a mutating request carries an Idempotency-Key; the first
-- response is stored in the same transaction as the change and replayed for a repeat.
create table idempotency_keys (
  user_id      uuid not null references profiles (id),
  key          text not null check (length(key) between 8 and 200),
  route        text not null,
  request_hash text not null,
  status       integer,
  response     jsonb,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, key)
);
create index idempotency_keys_created_idx on idempotency_keys (created_at);
alter table idempotency_keys enable row level security;
create policy api_own on idempotency_keys for all to eyeq_api using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy service_all on idempotency_keys for all to eyeq_service using (true) with check (true);
grant select, insert on idempotency_keys to eyeq_api;
grant update (status, response, completed_at) on idempotency_keys to eyeq_api;
grant select, insert, update, delete on idempotency_keys to eyeq_service;

-- ---------------------------------------------------------------- 4. admin grant
-- The only writer of admins outside the future admin UI. Same transaction as the audit row.
create function grant_admin_for(p_user_id uuid, p_role text, p_actor_role text default 'script', p_actor_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb;
begin
  if p_role not in ('coach', 'owner') then
    raise exception 'role must be coach or owner, not %', p_role using errcode = '22023';
  end if;
  perform ensure_profile_for(p_user_id);
  select to_jsonb(a) into v_before from admins a where user_id = p_user_id;
  insert into admins (user_id, role) values (p_user_id, p_role)
  on conflict (user_id) do update set role = excluded.role;
  select to_jsonb(a) into v_after from admins a where user_id = p_user_id;
  insert into audit_log (actor_id, actor_role, action, target_type, target_id, before, after)
  values (p_actor_id, p_actor_role, 'admin.grant', 'admin', p_user_id::text, v_before, v_after);
  return v_after;
end $$;

-- GET /me reads the athlete's own admin flag and whether they are a minor, under RLS.
grant select on admins to eyeq_api;
create policy api_own on admins for select to eyeq_api using (user_id = app_user_id());

grant execute on function ensure_my_profile(text), rate_limit_hit(text, text, timestamptz), is_minor(date, date) to eyeq_api;
grant execute on function ensure_profile_for(uuid, text), rate_limit_hit(text, text, timestamptz),
  grant_admin_for(uuid, text, text, uuid) to eyeq_service;

reset role;
