-- Phase 6 · scheduled jobs, the notification dispatcher's claim, the in-app feed's read
-- state, and the drills a coin unlock can open.
--
-- pg_cron (plan 2.2): every schedule is UTC (Monday 00:00 IST is `30 18 * * 0`). Each
-- job calls cron_run(name), one SECURITY DEFINER entry point owned by eyeq_owner, so the
-- role pg_cron runs as (the migration user: postgres, not a superuser on Supabase) needs
-- EXECUTE on that one function and nothing else. cron_run takes the clock as an
-- argument, so tests move time by argument (CLAUDE.md), never by waiting.
--
-- Additive: new columns, new functions, one function replaced with a superset of its
-- old signature. The previous release's code calls none of what changes.

create extension if not exists pg_cron;

set role eyeq_owner;

-- ---------------------------------------------------------------- notifications: feed and claim

alter table notifications
  add column read_at       timestamptz,  -- in-app feed read state
  add column claimed_until timestamptz;  -- dispatcher lease: a claimed row is invisible to other runs until then

-- Kinds a run enqueues; null means every kind. The plan names three schedules (daily
-- reminder and at-risk every 15 minutes, challenge ending hourly); each passes its kind.
drop function enqueue_notifications(timestamptz);
create function enqueue_notifications(p_as_of timestamptz default now(), p_kinds text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; n_daily integer := 0; n_risk integer := 0; n_chal integer := 0;
  v_nudge time := config_text('streak.nudge_time', p_as_of)::time;
  v_min integer := config_int('streak.at_risk_min_streak', p_as_of);
begin
  -- daily reminder at the athlete's chosen time (15-minute window)
  if p_kinds is null or 'daily_reminder' = any (p_kinds) then
    for r in
      select p.id, local_date(p_as_of, p.timezone) as d, local_time(p_as_of, p.timezone) as t, p.reminder_time
      from profiles p where p.notify_daily
    loop
      if r.t >= r.reminder_time and r.t < r.reminder_time + interval '15 minutes'
         and not exists (select 1 from session_completions c where c.user_id = r.id and c.local_date = r.d) then
        if enqueue_notification(r.id, 'daily_reminder', r.d, format('daily_reminder:%s:%s', r.id, r.d), jsonb_build_object('local_date', r.d)) then n_daily := n_daily + 1; end if;
      end if;
    end loop;
  end if;
  -- streak at risk at 8 pm local (D17) for streaks of at least 3
  if p_kinds is null or 'streak_at_risk' = any (p_kinds) then
    for r in
      select p.id, p.timezone, local_date(p_as_of, p.timezone) as d, local_time(p_as_of, p.timezone) as t
      from profiles p where p.notify_streak
    loop
      if r.t >= v_nudge and r.t < v_nudge + interval '15 minutes'
         and not exists (select 1 from session_completions c where c.user_id = r.id and c.local_date = r.d)
         and current_streak(r.id, r.d) >= v_min then
        if enqueue_notification(r.id, 'streak_at_risk', r.d, format('streak_at_risk:%s:%s', r.id, r.d),
             jsonb_build_object('streak', current_streak(r.id, r.d), 'ends_at', local_day_start(r.d + 1, r.timezone))) then n_risk := n_risk + 1; end if;
      end if;
    end loop;
  end if;
  -- challenge ending in the next 24 hours, for athletes who have not finished it
  if p_kinds is null or 'challenge_ending' = any (p_kinds) then
    for r in
      select ch.id as challenge_id, ch.title, ch.window_end, cp.user_id, local_date(p_as_of, p.timezone) as d
      from challenges ch join challenge_progress cp on cp.challenge_id = ch.id join profiles p on p.id = cp.user_id
      where p.notify_challenge and cp.completed_at is null
        and ch.window_end > p_as_of and ch.window_end <= p_as_of + interval '24 hours'
    loop
      if enqueue_notification(r.user_id, 'challenge_ending', r.d, format('challenge_ending:%s:%s', r.user_id, r.challenge_id),
           jsonb_build_object('challenge_id', r.challenge_id, 'title', r.title, 'window_end', r.window_end)) then n_chal := n_chal + 1; end if;
    end loop;
  end if;
  return jsonb_build_object('daily_reminder', n_daily, 'streak_at_risk', n_risk, 'challenge_ending', n_chal);
end $$;

-- The profile toggle that governs a kind (plan 6.9: each kind has one in Profile).
create function notification_allowed(p_user_id uuid, p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'daily_reminder'   then p.notify_daily
    when 'streak_at_risk'   then p.notify_streak
    when 'challenge_ending' then p.notify_challenge
    when 'weekly_recap'     then p.notify_recap
    when 'overtaken'        then p.notify_overtaken
    else true end                                      -- receipts are not optional
  from profiles p where p.id = p_user_id
$$;

-- Claim up to p_limit due rows for one dispatcher run. Rows locked by a concurrent run are
-- skipped (SKIP LOCKED) and a claimed row carries a lease, so two overlapping runs never
-- receive the same row. Toggles and the daily push cap are checked again here, at send
-- time: a row whose toggle was switched off after it was queued is skipped and recorded.
-- Returns each row with the device targets for its channel.
create function claim_notifications(p_limit integer default 50, p_lease interval default interval '2 minutes', p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n notifications; out jsonb := '[]'::jsonb; v_sent integer;
  v_cap integer := config_int('notifications.daily_push_cap', p_at);
begin
  for n in
    select * from notifications
    where status = 'queued' and send_after <= p_at and (claimed_until is null or claimed_until <= p_at)
    order by send_after, created_at
    limit p_limit
    for update skip locked
  loop
    if not coalesce(notification_allowed(n.user_id, n.kind), false) then
      update notifications set status = 'skipped', last_error = 'toggle_off', claimed_until = null where id = n.id;
      continue;
    end if;
    if n.channel = 'push' then
      select count(*) into v_sent from notifications
      where user_id = n.user_id and local_date = n.local_date and channel = 'push' and status = 'sent';
      if v_sent >= v_cap then
        update notifications set status = 'skipped', last_error = 'daily_cap', claimed_until = null where id = n.id;
        continue;
      end if;
    end if;
    update notifications set claimed_until = p_at + p_lease, attempts = attempts + 1 where id = n.id;
    out := out || jsonb_build_object(
      'id', n.id, 'user_id', n.user_id, 'kind', n.kind, 'channel', n.channel, 'data', n.data,
      'local_date', n.local_date, 'attempts', n.attempts + 1,
      'targets', case when n.channel = 'push' then coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'platform', t.platform, 'token', t.token) order by t.created_at)
        from push_tokens t where t.user_id = n.user_id and t.disabled_at is null), '[]'::jsonb) else '[]'::jsonb end);
  end loop;
  return out;
end $$;

-- Record what happened to a claimed row. 'retry' requeues with exponential backoff
-- (1, 2, 4, ... minutes, capped at an hour) until the attempt limit, then fails.
-- Only the run holding the lease may finish a row; a late finish after the lease
-- expired and another run took it over is ignored (returns false).
create function finish_notification(p_id uuid, p_outcome text, p_error text default null, p_at timestamptz default now(),
                                    p_max_attempts integer default 5) returns boolean
language plpgsql security definer set search_path = public as $$
declare n notifications;
begin
  select * into n from notifications where id = p_id and status = 'queued' and claimed_until > p_at for update;
  if not found then return false; end if;
  if p_outcome = 'sent' then
    update notifications set status = 'sent', sent_at = p_at, last_error = null, claimed_until = null where id = p_id;
  elsif p_outcome = 'skipped' then
    update notifications set status = 'skipped', last_error = p_error, claimed_until = null where id = p_id;
  elsif p_outcome = 'retry' and n.attempts < p_max_attempts then
    update notifications set last_error = p_error, claimed_until = null,
      send_after = p_at + least(interval '1 minute' * power(2, n.attempts - 1), interval '1 hour') where id = p_id;
  elsif p_outcome in ('retry', 'failed') then
    update notifications set status = 'failed', last_error = p_error, claimed_until = null where id = p_id;
  else
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;
  return true;
end $$;

-- ---------------------------------------------------------------- coin drill unlock (plan 6.5, P0)

-- The drills a coin unlock can open for this athlete: published, in a published program,
-- not already open to them. Titles and prices only; never a video reference (rule 5).
create function unlockable_drills_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'program_title', (x->>'sort')::integer, x->>'title'), '[]'::jsonb) from (
    select distinct on (d.id) jsonb_build_object(
      'id', d.id, 'title', d.title, 'duration_minutes', d.duration_minutes,
      'coin_price', coalesce(d.coin_price, (select coin_price from reward_items where kind = 'drill_unlock' and active order by sort limit 1)),
      'program_title', p.title, 'sort', s.day_number * 100 + sd."order") as x
    from drills d
    join session_drills sd on sd.drill_id = d.id
    join sessions s on s.id = sd.session_id
    join programs p on p.id = s.program_id and p.status = 'published'
    where d.status = 'published' and not has_access(p_user_id, 'drill', d.id, p_at)
    order by d.id, s.day_number, sd."order"
  ) t
$$;

create function my_unlockable_drills() returns jsonb language sql security definer set search_path = public as $$
  select unlockable_drills_for(require_user_id())
$$;

-- ---------------------------------------------------------------- scheduled jobs

-- The one function pg_cron calls. Unknown names raise, so a typo in a schedule fails
-- loudly in cron.job_run_details rather than doing nothing.
create function cron_run(p_job text, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  case p_job
    when 'leaderboard-refresh' then r := to_jsonb(leaderboard_refresh(p_at));
    when 'daily-reminder'      then r := enqueue_notifications(p_at, array['daily_reminder']);
    when 'streak-at-risk'      then r := enqueue_notifications(p_at, array['streak_at_risk']);
    when 'streak-close'        then r := to_jsonb(streak_close(p_at));
    when 'challenge-ending'    then r := enqueue_notifications(p_at, array['challenge_ending']);
    when 'rank-day-snapshot'   then r := to_jsonb(rank_day_snapshot(p_at));
    when 'week-rollover'       then r := week_rollover(p_at);
    when 'entitlement-expiry'  then r := to_jsonb(entitlement_expiry(p_at));
    else raise exception 'unknown job %', p_job using errcode = '22023';
  end case;
  return r;
end $$;

-- ---------------------------------------------------------------- grants

grant update (read_at) on notifications to eyeq_api;
grant execute on function my_unlockable_drills() to eyeq_api;
grant execute on function enqueue_notifications(timestamptz, text[]), notification_allowed(uuid, text),
  claim_notifications(integer, interval, timestamptz), finish_notification(uuid, text, text, timestamptz, integer),
  unlockable_drills_for(uuid, timestamptz), cron_run(text, timestamptz)
  to eyeq_service;

reset role;

-- The schedules, named eyeq-<job>. cron.schedule upserts by name, so re-applying after a
-- local reset (which keeps the cron schema) leaves one job per name.
do $$
declare
  jobs constant text[][] := array[
    ['leaderboard-refresh', '*/5 * * * *'],
    ['daily-reminder',      '*/15 * * * *'],
    ['streak-at-risk',      '*/15 * * * *'],
    ['streak-close',        '*/15 * * * *'],
    ['challenge-ending',    '0 * * * *'],
    ['rank-day-snapshot',   '30 18 * * *'],   -- 00:00 IST daily
    ['week-rollover',       '30 18 * * 0'],   -- Monday 00:00 IST
    ['entitlement-expiry',  '0 * * * *']];
  j text[];
begin
  execute format('grant execute on function public.cron_run(text, timestamptz) to %I', current_user);
  foreach j slice 1 in array jobs loop
    perform cron.schedule('eyeq-' || j[1], j[2], format('select public.cron_run(%L)', j[1]));
  end loop;
end $$;
