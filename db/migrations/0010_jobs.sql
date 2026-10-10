-- Phase 1 · job functions: leaderboards, day snapshot, streak close, week rollover,
-- entitlement expiry, notification enqueue, cache rebuilds. pg_cron schedules them
-- in phase 6; here they are called directly by tests.
set role eyeq_owner;

-- ---------------------------------------------------------------- leaderboards (plan 6.6)

-- Pure computation of the weekly board as of an instant: XP bucketed by created_at in
-- the ISO week (IST). Rank = 1 + number of PUBLIC athletes strictly ahead (higher XP,
-- or same XP reached earlier, then user id), so a private athlete still has a rank.
create function leaderboard_compute(p_as_of timestamptz default now())
returns table (week_start date, scope text, scope_value text, user_id uuid, xp integer, rank integer, last_xp_at timestamptz, is_public boolean)
language sql stable as $$
  with w as (
    select ist_week_start(p_as_of) as ws,
           local_day_start(ist_week_start(p_as_of), 'Asia/Kolkata') as t0,
           local_day_start(ist_week_start(p_as_of) + 7, 'Asia/Kolkata') as t1
  ),
  totals as (
    select x.user_id, sum(x.amount)::integer as xp, max(x.created_at) as last_xp_at
    from xp_ledger x, w where x.created_at >= w.t0 and x.created_at < w.t1 and x.created_at <= p_as_of
    group by x.user_id having sum(x.amount) > 0
  ),
  scoped as (
    select 'global'::text as scope, ''::text as scope_value, t.user_id, t.xp, t.last_xp_at, p.visibility = 'public' as is_public
    from totals t join profiles p on p.id = t.user_id
    union all
    select 'sport', p.sport, t.user_id, t.xp, t.last_xp_at, p.visibility = 'public'
    from totals t join profiles p on p.id = t.user_id where p.sport is not null
  ),
  ranked as (
    select s.*,
      1 + (select count(*) from scoped o
           where o.scope = s.scope and o.scope_value = s.scope_value and o.is_public and o.user_id <> s.user_id
             and (o.xp > s.xp or (o.xp = s.xp and (o.last_xp_at < s.last_xp_at or (o.last_xp_at = s.last_xp_at and o.user_id < s.user_id)))))::integer as rank
    from scoped s
  )
  select (select ws from w), scope, scope_value, user_id, xp, rank, last_xp_at, is_public from ranked
$$;

-- Rebuilt every 5 minutes. Keeps rank_day_start and never touches a finalised week.
create function leaderboard_refresh(p_as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with c as (select * from leaderboard_compute(p_as_of)),
  up as (
    insert into leaderboard_weekly (week_start, scope, scope_value, user_id, xp, rank, last_xp_at, is_public, updated_at)
    select week_start, scope, scope_value, user_id, xp, rank, last_xp_at, is_public, p_as_of from c
    on conflict (week_start, scope, scope_value, user_id) do update
      set xp = excluded.xp, rank = excluded.rank, last_xp_at = excluded.last_xp_at, is_public = excluded.is_public, updated_at = excluded.updated_at
      where not leaderboard_weekly.final
    returning 1)
  select count(*) into n from up;
  return n;
end $$;

-- At 00:00 IST: remember where everyone started the day, for movement arrows (plan 5.2).
create function rank_day_snapshot(p_as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform leaderboard_refresh(p_as_of);
  update leaderboard_weekly set rank_day_start = rank where week_start = ist_week_start(p_as_of) and not final;
  get diagnostics n = row_count;
  return n;
end $$;

-- Top N plus the athlete's own row, with the gap to the row above (board 6).
create function leaderboard_for(p_user_id uuid, p_period text default 'week', p_scope text default 'global', p_limit integer default 10, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_scope_value text := case when p_scope = 'sport' then coalesce((select sport from profiles where id = p_user_id), '') else '' end;
  v_week date := ist_week_start(p_at);
  v_rows jsonb; v_me jsonb; v_count integer; v_today date := user_local_date(p_user_id, p_at);
begin
  if p_period = 'week' then
    create temp table _lb on commit drop as
      select l.user_id, l.xp, l.rank, l.rank_day_start, l.is_public from leaderboard_weekly l
      where l.week_start = v_week and l.scope = p_scope and l.scope_value = v_scope_value;
  else
    create temp table _lb on commit drop as
      select s.user_id, s.total_xp as xp,
        (1 + (select count(*) from user_stats o join profiles op on op.id = o.user_id
              where op.visibility = 'public' and o.user_id <> s.user_id and (p_scope <> 'sport' or op.sport = v_scope_value)
                and (o.total_xp > s.total_xp or (o.total_xp = s.total_xp and o.user_id < s.user_id))))::integer as rank,
        null::integer as rank_day_start, p.visibility = 'public' as is_public
      from user_stats s join profiles p on p.id = s.user_id
      where s.total_xp > 0 and (p_scope <> 'sport' or p.sport = v_scope_value);
  end if;
  select count(*) into v_count from _lb where is_public;
  select coalesce(jsonb_agg(r order by (r->>'rank')::integer), '[]'::jsonb) into v_rows from (
    select jsonb_build_object('rank', l.rank, 'user_id', l.user_id, 'display_name', p.display_name,
      'initials', upper(left(regexp_replace(p.display_name, '^(\S)\S*\s*(\S?).*$', '\1\2'), 2)),
      'level', s.level, 'sport', case when p_scope = 'sport' then p.sport end, 'xp', l.xp,
      'delta', case when l.rank_day_start is null then null else l.rank_day_start - l.rank end,
      'trained_today', exists (select 1 from session_completions c where c.user_id = l.user_id and c.local_date = v_today),
      'is_me', l.user_id = p_user_id) as r
    from _lb l join profiles p on p.id = l.user_id left join user_stats s on s.user_id = l.user_id
    where l.is_public order by l.rank limit p_limit) t;
  select jsonb_build_object('rank', l.rank, 'xp', l.xp, 'delta', case when l.rank_day_start is null then null else l.rank_day_start - l.rank end,
      'is_public', l.is_public,
      'gap_above', (select jsonb_build_object('xp', a.xp - l.xp, 'display_name', ap.display_name, 'rank', a.rank)
                    from _lb a join profiles ap on ap.id = a.user_id where a.is_public and a.rank < l.rank order by a.rank desc limit 1),
      'gap_below', (select jsonb_build_object('xp', l.xp - b.xp, 'display_name', bp.display_name, 'rank', b.rank)
                    from _lb b join profiles bp on bp.id = b.user_id where b.is_public and b.rank > l.rank and b.user_id <> p_user_id order by b.rank asc limit 1))
    into v_me from _lb l where l.user_id = p_user_id;
  drop table _lb;
  return jsonb_build_object('period', p_period, 'scope', p_scope, 'scope_value', v_scope_value, 'week_start', case when p_period = 'week' then v_week end,
    'resets_at', local_day_start(v_week + 7, 'Asia/Kolkata'), 'count', v_count, 'rows', v_rows, 'me', v_me);
end $$;

-- ---------------------------------------------------------------- streak close (plan 6.4)

-- Runs every 15 minutes: for athletes whose local midnight has passed since their last
-- judgement, judge yesterday (consume a freeze, or let the streak end).
create function streak_close(p_as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select p.id, local_date(p_as_of, p.timezone) - 1 as yesterday
    from profiles p left join user_stats s on s.user_id = p.id
    where s.last_judged_local_date is null or s.last_judged_local_date < local_date(p_as_of, p.timezone) - 1
  loop
    perform settle_missed_days(r.id, r.yesterday);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- week rollover (Monday 00:00 IST)

create function week_rollover(p_as_of timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_week date := ist_week_start(p_as_of);
  v_prev date := v_week - 7;
  v_prev_end timestamptz := local_day_start(v_week, 'Asia/Kolkata');
  v_badges integer := 0; v_freezes integer; v_next uuid; r record; j jsonb; prev challenges;
begin
  -- 1. freeze last week's final ranks
  perform leaderboard_refresh(v_prev_end - interval '1 microsecond');
  update leaderboard_weekly set final = true where week_start = v_prev and not final;
  -- 2. weekly badges for everyone on last week's board
  for r in select distinct user_id from leaderboard_weekly where week_start = v_prev loop
    j := evaluate_badges(r.user_id, 'weekly', p_as_of);
    v_badges := v_badges + jsonb_array_length(j);
  end loop;
  -- 3. subscriber freezes (D3)
  v_freezes := grant_subscriber_freezes(v_week, p_as_of);
  -- 4. next weekly challenge: if none is scheduled, the current one repeats
  if not exists (select 1 from challenges where type = 'weekly' and window_start <= local_day_start(v_week, 'Asia/Kolkata') and window_end > local_day_start(v_week, 'Asia/Kolkata')) then
    select * into prev from challenges where type = 'weekly' and window_end <= local_day_start(v_week, 'Asia/Kolkata') order by window_end desc limit 1;
    if found then
      insert into challenges (type, title, description, goal, window_start, window_end, reward_xp, reward_coins, badge_id)
      values ('weekly', prev.title, prev.description, prev.goal, local_day_start(v_week, 'Asia/Kolkata'), local_day_start(v_week + 7, 'Asia/Kolkata'),
              prev.reward_xp, prev.reward_coins, prev.badge_id)
      returning id into v_next;
    end if;
  end if;
  -- 5. open this week's board
  perform leaderboard_refresh(p_as_of);
  return jsonb_build_object('week_start', v_week, 'finalised_week', v_prev, 'weekly_badges', v_badges, 'subscriber_freezes', v_freezes, 'new_challenge_id', v_next);
end $$;

-- ---------------------------------------------------------------- entitlement expiry (hourly)

create function entitlement_expiry(p_as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from entitlements where status in ('active', 'grace') and ends_at is not null and ends_at <= p_as_of loop
    perform set_entitlement_status(r.id, 'ended', 'ended', 'expired', null, null, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- notifications (plan 6.9)

-- Queues at most 2 pushes per athlete per local day; a third is recorded as skipped.
create function enqueue_notification(p_user_id uuid, p_kind text, p_local_date date, p_dedupe text, p_data jsonb, p_channel text default 'push') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_cap integer := config_int('notifications.daily_push_cap'); v_count integer; v_status text := 'queued'; v_err text;
begin
  if p_channel = 'push' then
    select count(*) into v_count from notifications where user_id = p_user_id and local_date = p_local_date and channel = 'push' and status in ('queued', 'sent');
    if v_count >= v_cap then v_status := 'skipped'; v_err := 'daily_cap'; end if;
  end if;
  insert into notifications (user_id, kind, channel, data, dedupe_key, status, local_date, last_error)
  values (p_user_id, p_kind, p_channel, p_data, p_dedupe, v_status, p_local_date, v_err)
  on conflict (dedupe_key) do nothing;
  return found and v_status = 'queued';
end $$;

-- One function, every kind. Called every 15 minutes (reminder, at-risk) and hourly (challenge ending);
-- each kind selects athletes by their local time and dedupes per day.
create function enqueue_notifications(p_as_of timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; n_daily integer := 0; n_risk integer := 0; n_chal integer := 0;
  v_nudge time := config_text('streak.nudge_time', p_as_of)::time;
  v_min integer := config_int('streak.at_risk_min_streak', p_as_of);
begin
  -- daily reminder at the athlete's chosen time (15-minute window)
  for r in
    select p.id, local_date(p_as_of, p.timezone) as d, local_time(p_as_of, p.timezone) as t, p.reminder_time
    from profiles p where p.notify_daily
  loop
    if r.t >= r.reminder_time and r.t < r.reminder_time + interval '15 minutes'
       and not exists (select 1 from session_completions c where c.user_id = r.id and c.local_date = r.d) then
      if enqueue_notification(r.id, 'daily_reminder', r.d, format('daily_reminder:%s:%s', r.id, r.d), jsonb_build_object('local_date', r.d)) then n_daily := n_daily + 1; end if;
    end if;
  end loop;
  -- streak at risk at 8 pm local (D17) for streaks of at least 3
  for r in
    select p.id, local_date(p_as_of, p.timezone) as d, local_time(p_as_of, p.timezone) as t
    from profiles p where p.notify_streak
  loop
    if r.t >= v_nudge and r.t < v_nudge + interval '15 minutes'
       and not exists (select 1 from session_completions c where c.user_id = r.id and c.local_date = r.d)
       and current_streak(r.id, r.d) >= v_min then
      if enqueue_notification(r.id, 'streak_at_risk', r.d, format('streak_at_risk:%s:%s', r.id, r.d),
           jsonb_build_object('streak', current_streak(r.id, r.d), 'ends_at', local_day_start(r.d + 1, (select timezone from profiles where id = r.id)))) then n_risk := n_risk + 1; end if;
    end if;
  end loop;
  -- challenge ending in the next 24 hours, for athletes who have not finished it
  for r in
    select ch.id as challenge_id, ch.title, ch.window_end, cp.user_id, local_date(p_as_of, p.timezone) as d
    from challenges ch join challenge_progress cp on cp.challenge_id = ch.id join profiles p on p.id = cp.user_id
    where p.notify_challenge and cp.completed_at is null
      and ch.window_end > p_as_of and ch.window_end <= p_as_of + interval '24 hours'
  loop
    if enqueue_notification(r.user_id, 'challenge_ending', r.d, format('challenge_ending:%s:%s', r.user_id, r.challenge_id),
         jsonb_build_object('challenge_id', r.challenge_id, 'title', r.title, 'window_end', r.window_end)) then n_chal := n_chal + 1; end if;
  end loop;
  return jsonb_build_object('daily_reminder', n_daily, 'streak_at_risk', n_risk, 'challenge_ending', n_chal);
end $$;

-- ---------------------------------------------------------------- rebuilds (rule 3)

create function rebuild_user_stats(p_user_id uuid) returns user_stats
language plpgsql security definer set search_path = public as $$
declare v user_stats; v_xp integer := total_xp(p_user_id);
begin
  perform ensure_user_stats(p_user_id);
  update user_stats set
    total_xp = v_xp, level = level_for_xp(v_xp),
    current_streak = current_streak(p_user_id, user_local_date(p_user_id)),
    best_streak = best_streak(p_user_id),
    freezes_held = freezes_held(p_user_id),
    coins = coin_balance(p_user_id), credits = credit_balance(p_user_id),
    updated_at = now()
  where user_id = p_user_id returning * into v;
  return v;
end $$;

create function rebuild_all_user_stats() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from profiles loop perform rebuild_user_stats(r.id); n := n + 1; end loop;
  return n;
end $$;

-- Rebuild the current week's board from the ledger, including rank_day_start from the
-- ranks as they stood at the start of the IST day.
create function rebuild_leaderboards(p_as_of timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare v_week date := ist_week_start(p_as_of); v_day0 timestamptz := local_day_start((p_as_of at time zone 'Asia/Kolkata')::date, 'Asia/Kolkata'); n integer;
begin
  delete from leaderboard_weekly where week_start = v_week and not final;
  n := leaderboard_refresh(p_as_of);
  update leaderboard_weekly l set rank_day_start = c.rank
  from leaderboard_compute(v_day0) c
  where l.week_start = v_week and l.scope = c.scope and l.scope_value = c.scope_value and l.user_id = c.user_id and not l.final;
  return n;
end $$;

reset role;
