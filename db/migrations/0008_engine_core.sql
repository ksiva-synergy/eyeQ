-- Phase 1 · engine core: levels, XP, streaks, access, entitlements, coins.
-- Functions that write ledgers are SECURITY DEFINER, owned by eyeq_owner, with a
-- fixed search_path (plan 5.3). Internal functions take the user id explicitly;
-- the public ones (migration 0009) read it from app.user_id.
set role eyeq_owner;

-- ---------------------------------------------------------------- levels (plan 6.2)

-- Threshold for level n: round(base * n^exponent) for n >= 2; level 1 starts at 0.
create function level_threshold(p_level integer, p_at timestamptz default now()) returns integer
language sql stable as $$
  select case when p_level <= 1 then 0
    else round(config_num('level.base', p_at) * power(p_level::numeric, config_num('level.exponent', p_at)))::integer end
$$;

-- Highest level whose threshold is at or below the XP, never below 1.
create function level_for_xp(p_xp integer, p_at timestamptz default now()) returns integer
language plpgsql stable as $$
declare
  v_base numeric := config_num('level.base', p_at);
  v_exp numeric := config_num('level.exponent', p_at);
  n integer;
begin
  if p_xp <= 0 then return 1; end if;
  n := greatest(1, floor(power(p_xp / v_base, 1 / v_exp))::integer);
  while level_threshold(n + 1, p_at) <= p_xp loop n := n + 1; end loop;
  while n > 1 and level_threshold(n, p_at) > p_xp loop n := n - 1; end loop;
  return n;
end $$;

-- Rank title for a level, from the bands in config (D1).
create function rank_title(p_level integer, p_at timestamptz default now()) returns text
language sql stable as $$
  select b->>'title'
  from jsonb_array_elements(config_value('level.rank_titles', p_at)) b
  where (b->>'from')::integer <= p_level
  order by (b->>'from')::integer desc
  limit 1
$$;

create function level_progress(p_xp integer, p_at timestamptz default now()) returns jsonb
language plpgsql stable as $$
declare
  v_level integer := level_for_xp(p_xp, p_at);
  v_floor integer := level_threshold(v_level, p_at);
  v_next integer := level_threshold(v_level + 1, p_at);
begin
  return jsonb_build_object(
    'level', v_level,
    'title', rank_title(v_level, p_at),
    'total_xp', p_xp,
    'xp_in_level', p_xp - v_floor,
    'xp_for_level', v_next - v_floor,
    'to_next', v_next - p_xp,
    'next_threshold', v_next
  );
end $$;

-- ---------------------------------------------------------------- streak multiplier (plan 6.1)

create function streak_multiplier(p_streak integer, p_at timestamptz default now()) returns numeric
language sql stable as $$
  select least(
    floor(p_streak / config_num('streak.multiplier_days', p_at)) * config_num('streak.multiplier_step', p_at),
    config_num('streak.multiplier_cap', p_at))
$$;

-- The multiplier row's amount for a session: round_half_up(base * (1 + m)) - base.
create function multiplier_bonus(p_base integer, p_streak integer, p_at timestamptz default now()) returns integer
language sql stable as $$
  select round_half_up(p_base * (1 + streak_multiplier(p_streak, p_at))) - p_base
$$;

-- ---------------------------------------------------------------- user_stats helpers

create function ensure_user_stats(p_user_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into user_stats (user_id) values (p_user_id) on conflict do nothing
$$;

create function user_timezone(p_user_id uuid) returns text
language sql stable as $$
  select coalesce((select timezone from profiles where id = p_user_id), 'Asia/Kolkata')
$$;

create function user_local_date(p_user_id uuid, p_ts timestamptz default now()) returns date
language sql stable as $$
  select local_date(p_ts, user_timezone(p_user_id))
$$;

create function coin_balance(p_user_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from coin_ledger where user_id = p_user_id
$$;

create function credit_balance(p_user_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from credit_ledger where user_id = p_user_id
$$;

create function freezes_held(p_user_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from freeze_ledger where user_id = p_user_id
$$;

-- Freezes held at the end of a local day, in fact time: grants and purchases made by then,
-- uses and refunds by the day they concern.
create function freezes_held_at(p_user_id uuid, p_day date) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from freeze_ledger
  where user_id = p_user_id and (
    (reason in ('used', 'refund') and local_date <= p_day)
    or (reason not in ('used', 'refund') and created_at < local_day_start(p_day + 1, user_timezone(p_user_id))))
$$;

create function total_xp(p_user_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from xp_ledger where user_id = p_user_id
$$;

-- ---------------------------------------------------------------- XP (plan 6.1)

-- Writes one xp_ledger row. Capped reasons share the daily cap; a row that would exceed
-- it is truncated and flagged. Returns the row.
create function award_xp(
  p_user_id uuid, p_amount integer, p_reason text, p_source_id uuid, p_local_date date,
  p_at timestamptz default now()
) returns xp_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_capped boolean := p_reason in ('drill', 'session_bonus', 'personal_best', 'streak_multiplier');
  v_cap integer;
  v_so_far integer;
  v_amount integer := greatest(p_amount, 0);
  v_row xp_ledger;
begin
  if v_capped then
    v_cap := config_int('xp.daily_cap', p_at);
    select coalesce(sum(amount), 0) into v_so_far from xp_ledger
    where user_id = p_user_id and local_date = p_local_date
      and reason in ('drill', 'session_bonus', 'personal_best', 'streak_multiplier');
    v_amount := greatest(least(v_amount, v_cap - v_so_far), 0);
  end if;
  insert into xp_ledger (user_id, amount, requested_amount, truncated, reason, source_id, local_date, created_at)
  values (p_user_id, v_amount, greatest(p_amount, 0), v_amount < greatest(p_amount, 0), p_reason, p_source_id, p_local_date, p_at)
  returning * into v_row;
  return v_row;
end $$;

create function daily_capped_xp(p_user_id uuid, p_local_date date) returns integer
language sql stable as $$
  select coalesce(sum(amount), 0)::integer from xp_ledger
  where user_id = p_user_id and local_date = p_local_date
    and reason in ('drill', 'session_bonus', 'personal_best', 'streak_multiplier')
$$;

-- ---------------------------------------------------------------- streaks (plan 6.4)

-- Days that keep a streak alive: completed days (that count) and frozen days.
-- A frozen day is one with a 'used' freeze and no refund (a refund means a completion
-- arrived later, so the day is completed anyway).
create function streak_days(p_user_id uuid)
returns table (d date, completed boolean)
language sql stable as $$
  select local_date, true from session_completions
  where user_id = p_user_id and counts_for_streak
  union
  select f.local_date, false from freeze_ledger f
  where f.user_id = p_user_id and f.reason = 'used'
    and not exists (select 1 from session_completions s where s.user_id = p_user_id and s.local_date = f.local_date and s.counts_for_streak)
$$;

-- Length of the run that ends on p_date: completed days count, frozen days hold.
-- 0 if p_date is neither completed nor frozen.
create function streak_run(p_user_id uuid, p_date date) returns integer
language sql stable as $$
  with days as (select * from streak_days(p_user_id) where d <= p_date),
  islands as (
    select d, completed, d - (row_number() over (order by d))::integer as grp from days
  )
  select coalesce((
    select count(*) filter (where completed)::integer
    from islands where grp = (select grp from islands where d = p_date)
  ), 0)
$$;

-- Current streak as the athlete sees it on p_today: today's run if today is done,
-- otherwise yesterday's run (today is still pending).
create function current_streak(p_user_id uuid, p_today date) returns integer
language sql stable as $$
  select case
    when exists (select 1 from session_completions where user_id = p_user_id and local_date = p_today and counts_for_streak)
      then streak_run(p_user_id, p_today)
    else streak_run(p_user_id, p_today - 1)
  end
$$;

create function best_streak(p_user_id uuid) returns integer
language sql stable as $$
  with days as (select * from streak_days(p_user_id)),
  islands as (select d, completed, d - (row_number() over (order by d))::integer as grp from days)
  select coalesce(max(c), 0)::integer from (
    select count(*) filter (where completed) as c from islands group by grp
  ) t
$$;

-- Recompute the streak from facts into user_stats (never incremented blindly).
create function recompute_streak(p_user_id uuid, p_today date default null) returns user_stats
language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, user_local_date(p_user_id));
  v_row user_stats;
begin
  perform ensure_user_stats(p_user_id);
  update user_stats set
    current_streak = current_streak(p_user_id, v_today),
    best_streak = best_streak(p_user_id),
    freezes_held = freezes_held(p_user_id),
    updated_at = now()
  where user_id = p_user_id
  returning * into v_row;
  return v_row;
end $$;

-- Judge every unjudged day up to p_through (yesterday, usually): a missed day consumes a
-- held freeze when there is a streak to protect; otherwise the streak simply ends.
-- Idempotent through user_stats.last_judged_local_date.
create function settle_missed_days(p_user_id uuid, p_through date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_from date;
  v_day date;
  v_used integer := 0;
  v_first date;
begin
  perform ensure_user_stats(p_user_id);
  select last_judged_local_date into v_from from user_stats where user_id = p_user_id for update;
  if v_from is null then
    select min(d) into v_first from streak_days(p_user_id);
    if v_first is null then
      update user_stats set last_judged_local_date = p_through where user_id = p_user_id;
      return 0;
    end if;
    v_from := v_first - 1;
  end if;
  v_day := v_from + 1;
  while v_day <= p_through loop
    if not exists (select 1 from streak_days(p_user_id) sd where sd.d = v_day) then
      if streak_run(p_user_id, v_day - 1) > 0 and freezes_held_at(p_user_id, v_day) > 0 then
        insert into freeze_ledger (user_id, amount, reason, local_date) values (p_user_id, -1, 'used', v_day);
        v_used := v_used + 1;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  update user_stats set last_judged_local_date = greatest(coalesce(last_judged_local_date, p_through), p_through)
  where user_id = p_user_id;
  perform recompute_streak(p_user_id);
  return v_used;
end $$;

-- ---------------------------------------------------------------- entitlements (rule 4)

create function has_active_subscription(p_user_id uuid, p_at timestamptz default now()) returns boolean
language sql stable as $$
  select exists (
    select 1 from entitlements
    where user_id = p_user_id and scope = 'subscription' and status in ('active', 'grace')
      and starts_at <= p_at and (ends_at is null or ends_at > p_at))
$$;

create function has_entitlement(p_user_id uuid, p_scope text, p_scope_id uuid, p_at timestamptz default now()) returns boolean
language sql stable as $$
  select exists (
    select 1 from entitlements
    where user_id = p_user_id and scope = p_scope and scope_id = p_scope_id and status in ('active', 'grace')
      and starts_at <= p_at and (ends_at is null or ends_at > p_at))
$$;

-- The only question any code path asks before opening content.
create function has_access(p_user_id uuid, p_scope text, p_scope_id uuid, p_at timestamptz default now()) returns boolean
language plpgsql stable as $$
declare
  v_program programs;
  v_drill drills;
begin
  if p_scope = 'subscription' then
    return has_active_subscription(p_user_id, p_at);
  elsif p_scope = 'program' then
    select * into v_program from programs where id = p_scope_id;
    if not found then return false; end if;
    if v_program.is_free then return true; end if;
    if has_entitlement(p_user_id, 'program', p_scope_id, p_at) then return true; end if;
    return v_program.in_subscription and has_active_subscription(p_user_id, p_at);
  elsif p_scope = 'drill' then
    select * into v_drill from drills where id = p_scope_id;
    if not found then return false; end if;
    if v_drill.access in ('free_preview', 'free_pool') then return true; end if;
    if has_entitlement(p_user_id, 'drill', p_scope_id, p_at) then return true; end if;
    if v_drill.access = 'ppv' then return false; end if;
    -- included: accessible through any accessible program that contains it
    return exists (
      select 1 from session_drills sd join sessions s on s.id = sd.session_id
      where sd.drill_id = p_scope_id and has_access(p_user_id, 'program', s.program_id, p_at));
  elsif p_scope = 'challenge' then
    return has_entitlement(p_user_id, 'challenge', p_scope_id, p_at);
  end if;
  return false;
end $$;

create function entitlement_snapshot(e entitlements) returns jsonb
language sql immutable as $$
  select jsonb_build_object('status', e.status, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'source', e.source, 'scope', e.scope, 'scope_id', e.scope_id, 'external_ref', e.external_ref)
$$;

-- Grant or extend. An existing live entitlement with the same user/scope/scope_id/source is
-- extended (ends_at pushed, lifetime wins); otherwise a new row. Always writes an event.
create function grant_entitlement(
  p_user_id uuid, p_scope text, p_scope_id uuid, p_source text,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null,
  p_external_ref text default null, p_payment_event_id uuid default null,
  p_admin_id uuid default null, p_reason text default null
) returns entitlements
language plpgsql security definer set search_path = public as $$
declare
  v_row entitlements;
begin
  select * into v_row from entitlements
  where user_id = p_user_id and scope = p_scope and scope_id is not distinct from p_scope_id
    and source = p_source and status in ('active', 'grace')
  order by coalesce(ends_at, 'infinity'::timestamptz) desc
  limit 1 for update;

  if found then
    update entitlements set
      ends_at = case when p_ends_at is null or ends_at is null then null else greatest(ends_at, p_ends_at) end,
      status = 'active',
      external_ref = coalesce(p_external_ref, external_ref),
      updated_at = now()
    where id = v_row.id returning * into v_row;
    insert into entitlement_events (entitlement_id, change, reason, payment_event_id, admin_id, snapshot)
    values (v_row.id, 'extended', p_reason, p_payment_event_id, p_admin_id, entitlement_snapshot(v_row));
  else
    insert into entitlements (user_id, scope, scope_id, source, starts_at, ends_at, external_ref)
    values (p_user_id, p_scope, p_scope_id, p_source, p_starts_at, p_ends_at, p_external_ref)
    returning * into v_row;
    insert into entitlement_events (entitlement_id, change, reason, payment_event_id, admin_id, snapshot)
    values (v_row.id, 'granted', p_reason, p_payment_event_id, p_admin_id, entitlement_snapshot(v_row));
  end if;
  return v_row;
end $$;

create function set_entitlement_status(
  p_entitlement_id uuid, p_status text, p_change text, p_reason text,
  p_ends_at timestamptz default null, p_payment_event_id uuid default null, p_admin_id uuid default null
) returns entitlements
language plpgsql security definer set search_path = public as $$
declare v_row entitlements;
begin
  update entitlements set
    status = p_status,
    ends_at = coalesce(p_ends_at, ends_at),
    updated_at = now()
  where id = p_entitlement_id returning * into v_row;
  if not found then raise exception 'entitlement % not found', p_entitlement_id; end if;
  insert into entitlement_events (entitlement_id, change, reason, payment_event_id, admin_id, snapshot)
  values (v_row.id, p_change, p_reason, p_payment_event_id, p_admin_id, entitlement_snapshot(v_row));
  return v_row;
end $$;

create function end_entitlement(
  p_entitlement_id uuid, p_reason text, p_at timestamptz default now(),
  p_payment_event_id uuid default null, p_admin_id uuid default null, p_revoked boolean default false
) returns entitlements
language sql security definer set search_path = public as $$
  select set_entitlement_status(p_entitlement_id, 'ended', case when p_revoked then 'revoked' else 'ended' end,
    p_reason, p_at, p_payment_event_id, p_admin_id)
$$;

-- ---------------------------------------------------------------- coins and credits (plan 6.5)

-- A spend is a negative row in the same transaction as what it buys. The user_stats row
-- is locked so concurrent spends serialise; the ledger trigger still refuses a negative balance.
create function spend_coins(p_user_id uuid, p_amount integer, p_reason text, p_source_id uuid default null) returns coin_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_row coin_ledger;
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'spend amount must be positive'; end if;
  perform ensure_user_stats(p_user_id);
  perform 1 from user_stats where user_id = p_user_id for update;
  v_balance := coin_balance(p_user_id);
  if v_balance < p_amount then
    raise exception 'insufficient_coins: have %, need %', v_balance, p_amount using errcode = 'P0001';
  end if;
  insert into coin_ledger (user_id, amount, reason, source_id) values (p_user_id, -p_amount, p_reason, p_source_id)
  returning * into v_row;
  update user_stats set coins = v_balance - p_amount, updated_at = now() where user_id = p_user_id;
  return v_row;
end $$;

create function earn_coins(p_user_id uuid, p_amount integer, p_reason text, p_source_id uuid default null) returns coin_ledger
language plpgsql security definer set search_path = public as $$
declare v_row coin_ledger;
begin
  if p_amount <= 0 then raise exception 'earn amount must be positive'; end if;
  perform ensure_user_stats(p_user_id);
  insert into coin_ledger (user_id, amount, reason, source_id) values (p_user_id, p_amount, p_reason, p_source_id)
  returning * into v_row;
  update user_stats set coins = coin_balance(p_user_id), updated_at = now() where user_id = p_user_id;
  return v_row;
end $$;

create function spend_credits(p_user_id uuid, p_amount integer, p_reason text, p_source_id uuid default null) returns credit_ledger
language plpgsql security definer set search_path = public as $$
declare
  v_row credit_ledger;
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'spend amount must be positive'; end if;
  perform ensure_user_stats(p_user_id);
  perform 1 from user_stats where user_id = p_user_id for update;
  v_balance := credit_balance(p_user_id);
  if v_balance < p_amount then
    raise exception 'insufficient_credits: have %, need %', v_balance, p_amount using errcode = 'P0001';
  end if;
  insert into credit_ledger (user_id, amount, reason, source_id) values (p_user_id, -p_amount, p_reason, p_source_id)
  returning * into v_row;
  update user_stats set credits = v_balance - p_amount, updated_at = now() where user_id = p_user_id;
  return v_row;
end $$;

-- Freezes: granted to subscribers on a schedule, bought with coins, never past the cap.
create function add_freeze(p_user_id uuid, p_reason text, p_local_date date default null, p_source_id uuid default null, p_at timestamptz default now()) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_cap integer := config_int('streak.freeze_max_held', p_at);
begin
  perform ensure_user_stats(p_user_id);
  perform 1 from user_stats where user_id = p_user_id for update;
  if freezes_held(p_user_id) >= v_cap then return false; end if;
  insert into freeze_ledger (user_id, amount, reason, local_date, source_id, created_at) values (p_user_id, 1, p_reason, p_local_date, p_source_id, p_at);
  update user_stats set freezes_held = freezes_held(p_user_id), updated_at = now() where user_id = p_user_id;
  return true;
end $$;

-- plan 6.4: called from week_rollover; the schedule (1 a week, D3) and cap live in config.
create function grant_subscriber_freezes(p_week_start date default ist_week_start(now()), p_at timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_per_week integer := config_int('streak.subscriber_freeze_per_week', p_at);
  v_user uuid;
  v_count integer := 0;
  i integer;
begin
  for v_user in
    select distinct user_id from entitlements
    where scope = 'subscription' and status in ('active', 'grace') and starts_at <= p_at and (ends_at is null or ends_at > p_at)
  loop
    if exists (select 1 from freeze_ledger where user_id = v_user and reason = 'sub_grant' and local_date = p_week_start) then
      continue;
    end if;
    for i in 1..v_per_week loop
      if add_freeze(v_user, 'sub_grant', p_week_start, null, p_at) then v_count := v_count + 1; end if;
    end loop;
  end loop;
  return v_count;
end $$;

reset role;
