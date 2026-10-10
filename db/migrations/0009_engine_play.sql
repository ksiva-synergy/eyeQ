-- Phase 1 · engine play: today's session, enrolment, badges, challenges,
-- complete_drill, rewards, media, Home and Progress payloads.
-- *_for(p_user_id, ...) are internal; the public wrappers read app.user_id (plan 5.3).
set role eyeq_owner;

-- ---------------------------------------------------------------- free drill of the day (D20)

create function free_drill_of_day(p_date date) returns uuid
language sql stable as $$
  select id from drills
  where access = 'free_pool' and status = 'published'
  order by md5(p_date::text || id::text) limit 1
$$;

-- ---------------------------------------------------------------- sessions and modules

create function session_drill_list(p_session_id uuid, p_user_id uuid, p_local_date date) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'drill_id', d.id, 'order', sd."order", 'title', d.title,
      'measurement_tag', d.measurement_tag, 'measurement_name', mt.name, 'measurement_group', mt."group",
      'duration_minutes', d.duration_minutes, 'xp', drill_xp(d),
      'access', d.access, 'score_type', d.score_type, 'target_label', d.target_label,
      'locked', not has_access(p_user_id, 'drill', d.id),
      'done', exists (select 1 from drill_completions c where c.user_id = p_user_id and c.drill_id = d.id and c.session_id = p_session_id and c.local_date = p_local_date)
    ) order by sd."order"), '[]'::jsonb)
  from session_drills sd
  join drills d on d.id = sd.drill_id
  left join measurement_tags mt on mt.slug = d.measurement_tag
  where sd.session_id = p_session_id
$$;

create function module_complete(p_user_id uuid, p_module_id uuid) returns boolean
language sql stable as $$
  select exists (select 1 from sessions where module_id = p_module_id)
    and not exists (
      select 1 from sessions s where s.module_id = p_module_id
        and not exists (select 1 from session_completions c where c.user_id = p_user_id and c.session_id = s.id))
$$;

-- plan 6.3: immediate, after the previous module is complete, or on day N of the enrolment.
create function module_unlocked(p_user_id uuid, p_module_id uuid, p_enrollment enrollments, p_today date) returns boolean
language plpgsql stable as $$
declare m modules; prev uuid;
begin
  select * into m from modules where id = p_module_id;
  if m.unlock_rule = 'immediate' then return true; end if;
  if m.unlock_rule = 'on_day' then
    return (p_today - p_enrollment.start_local_date + 1) >= m.unlock_day;
  end if;
  select id into prev from modules where program_id = m.program_id and "order" < m."order" order by "order" desc limit 1;
  if prev is null then return true; end if;
  return module_complete(p_user_id, prev);
end $$;

create function session_xp_preview(p_user_id uuid, p_session_id uuid, p_local_date date, p_at timestamptz default now()) returns jsonb
language plpgsql stable as $$
declare
  v_drills integer := 0;
  v_bonus integer := config_int('xp.session_bonus', p_at);
  v_streak integer := streak_run(p_user_id, p_local_date - 1);
  v_mult integer;
begin
  select coalesce(sum(drill_xp(d, p_at)), 0) into v_drills
  from session_drills sd join drills d on d.id = sd.drill_id where sd.session_id = p_session_id;
  v_mult := multiplier_bonus(v_drills + v_bonus, v_streak, p_at);
  return jsonb_build_object('drills', v_drills, 'session_bonus', v_bonus, 'multiplier', v_mult,
    'multiplier_factor', 1 + streak_multiplier(v_streak, p_at), 'total', v_drills + v_bonus + v_mult);
end $$;

-- plan 6.3
create function todays_session_for(p_user_id uuid, p_today date default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := coalesce(p_today, user_local_date(p_user_id, p_at));
  e enrollments;
  p programs;
  s sessions;
  m modules;
  v_done boolean := false;
  v_locked text := null;
  v_free uuid;
  d drills;
  v_sc session_completions;
begin
  select * into e from enrollments where user_id = p_user_id and is_active;
  select * into v_sc from session_completions where user_id = p_user_id and local_date = v_today;

  if e.id is not null then
    select * into p from programs where id = e.program_id;
    if e.last_completed_local_date = v_today and e.last_completed_session_id is not null then
      select * into s from sessions where id = e.last_completed_session_id;
      v_done := true;
    else
      select * into s from sessions where program_id = e.program_id and day_number = e.current_day;
    end if;
    if s.id is not null then
      select * into m from modules where id = s.module_id;
      if not has_access(p_user_id, 'program', p.id, p_at) then v_locked := 'paywall';
      elsif not module_unlocked(p_user_id, m.id, e, v_today) then v_locked := 'module';
      end if;
      if v_locked is null or v_done then
        return jsonb_build_object(
          'kind', 'program', 'session_id', s.id, 'program_id', p.id, 'program_slug', p.slug, 'program_title', p.title,
          'enrollment_id', e.id, 'day_number', s.day_number, 'duration_days', p.duration_days,
          'module_id', m.id, 'module_title', m.title, 'module_order', m."order",
          'title', s.title, 'est_minutes', s.est_minutes,
          'drills', session_drill_list(s.id, p_user_id, v_today),
          'completed', v_done, 'locked', v_locked,
          'xp_preview', session_xp_preview(p_user_id, s.id, v_today, p_at),
          'local_date', v_today);
      end if;
    end if;
  end if;

  -- Free tier, or no accessible program session: the day's free drill (D20).
  v_free := free_drill_of_day(v_today);
  if v_free is null then
    return jsonb_build_object('kind', 'none', 'completed', v_sc.id is not null, 'locked', v_locked, 'local_date', v_today);
  end if;
  select * into d from drills where id = v_free;
  return jsonb_build_object(
    'kind', 'free', 'drill_id', d.id, 'title', d.title, 'est_minutes', d.duration_minutes,
    'drills', jsonb_build_array(jsonb_build_object('drill_id', d.id, 'order', 1, 'title', d.title,
      'measurement_tag', d.measurement_tag, 'duration_minutes', d.duration_minutes, 'xp', drill_xp(d, p_at),
      'access', d.access, 'score_type', d.score_type, 'target_label', d.target_label, 'locked', false,
      'done', exists (select 1 from drill_completions c where c.user_id = p_user_id and c.drill_id = d.id and c.local_date = v_today))),
    'completed', v_sc.id is not null and v_sc.free_drill_id = d.id, 'locked', v_locked,
    'program_locked', v_locked,
    'xp_preview', jsonb_build_object('drills', drill_xp(d, p_at), 'session_bonus', config_int('xp.session_bonus', p_at),
      'multiplier', multiplier_bonus(drill_xp(d, p_at) + config_int('xp.session_bonus', p_at), streak_run(p_user_id, v_today - 1), p_at),
      'total', drill_xp(d, p_at) + config_int('xp.session_bonus', p_at)
        + multiplier_bonus(drill_xp(d, p_at) + config_int('xp.session_bonus', p_at), streak_run(p_user_id, v_today - 1), p_at)),
    'local_date', v_today);
end $$;

create function todays_session() returns jsonb
language sql security definer set search_path = public as $$
  select todays_session_for(require_user_id())
$$;

-- ---------------------------------------------------------------- enrol

create function enroll_for(p_user_id uuid, p_program_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p programs; e enrollments;
begin
  select * into p from programs where id = p_program_id and status = 'published';
  if not found then raise exception 'program_not_found' using errcode = 'P0002'; end if;
  if not has_access(p_user_id, 'program', p.id, p_at) then
    raise exception 'program_locked' using errcode = 'P0003';
  end if;
  update enrollments set is_active = false where user_id = p_user_id and is_active and program_id <> p_program_id;
  insert into enrollments (user_id, program_id, started_at, start_local_date, is_active)
  values (p_user_id, p_program_id, p_at, user_local_date(p_user_id, p_at), true)
  on conflict (user_id, program_id) do update set is_active = true
  returning * into e;
  return jsonb_build_object('enrollment_id', e.id, 'program_id', e.program_id, 'current_day', e.current_day,
    'started_at', e.started_at, 'completed_at', e.completed_at);
end $$;

create function enroll(p_program_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select enroll_for(require_user_id(), p_program_id)
$$;

-- ---------------------------------------------------------------- metrics (plan 6.7)

-- One evaluator for badge rules and challenge goals. Returns the metric's value for the
-- athlete inside [p_from, p_to). Rules: {"metric", "gte"|"lte", "tag", "drill_id", "value",
-- "hour", "scope", "module_id"}.
create function metric_value(p_user_id uuid, p_rule jsonb, p_from timestamptz default '-infinity', p_to timestamptz default 'infinity', p_at timestamptz default now()) returns numeric
language plpgsql stable as $$
declare
  m text := p_rule->>'metric';
  v numeric := 0;
  tz text := user_timezone(p_user_id);
begin
  case m
    when 'current_streak' then v := current_streak(p_user_id, local_date(p_at, tz));
    when 'best_streak' then v := best_streak(p_user_id);
    when 'sessions_total' then
      select count(*) into v from session_completions where user_id = p_user_id and completed_at >= p_from and completed_at < p_to;
    when 'minutes_total' then
      select coalesce(sum(d.duration_minutes), 0) into v from drill_completions c join drills d on d.id = c.drill_id
      where c.user_id = p_user_id and c.completed_at >= p_from and c.completed_at < p_to;
    when 'drills_with_tag' then
      select count(*) into v from drill_completions c join drills d on d.id = c.drill_id
      where c.user_id = p_user_id and d.measurement_tag = p_rule->>'tag' and c.completed_at >= p_from and c.completed_at < p_to;
    when 'drill_count' then
      select count(*) into v from drill_completions c
      where c.user_id = p_user_id and c.drill_id = (p_rule->>'drill_id')::uuid and c.completed_at >= p_from and c.completed_at < p_to;
    when 'program_completions' then
      select count(*) into v from enrollments where user_id = p_user_id and completed_at >= p_from and completed_at < p_to;
    when 'module_completions' then
      select count(*) into v from modules mo
      where module_complete(p_user_id, mo.id)
        and (select max(c.completed_at) from session_completions c join sessions s on s.id = c.session_id
             where c.user_id = p_user_id and s.module_id = mo.id) >= p_from
        and (select max(c.completed_at) from session_completions c join sessions s on s.id = c.session_id
             where c.user_id = p_user_id and s.module_id = mo.id) < p_to;
    when 'module_sessions' then
      select count(*) into v from sessions s
      where s.module_id = (p_rule->>'module_id')::uuid
        and exists (select 1 from session_completions c where c.user_id = p_user_id and c.session_id = s.id and c.completed_at >= p_from and c.completed_at < p_to);
    when 'personal_bests' then
      select count(*) into v from xp_ledger where user_id = p_user_id and reason = 'personal_best' and created_at >= p_from and created_at < p_to;
    when 'score_gte' then
      select coalesce(max(score), 0) into v from drill_completions
      where user_id = p_user_id and drill_id = (p_rule->>'drill_id')::uuid and score is not null and completed_at >= p_from and completed_at < p_to;
    when 'weekly_challenge_wins' then
      select count(*) into v from challenge_progress cp join challenges ch on ch.id = cp.challenge_id
      where cp.user_id = p_user_id and ch.type = 'weekly' and cp.completed_at >= p_from and cp.completed_at < p_to;
    when 'weekly_rank_lte' then
      select coalesce(min(rank), 999999) into v from leaderboard_weekly
      where user_id = p_user_id and final and scope = coalesce(p_rule->>'scope', 'global')
        and local_day_start(week_start, 'Asia/Kolkata') >= p_from and local_day_start(week_start, 'Asia/Kolkata') < p_to;
    when 'sessions_before_hour' then
      select count(*) into v from session_completions
      where user_id = p_user_id and completed_at >= p_from and completed_at < p_to
        and extract(hour from local_time(completed_at, tz)) < (p_rule->>'hour')::numeric;
    when 'shares_total' then v := 0;   -- P1
    else raise exception 'unknown metric %', m;
  end case;
  return v;
end $$;

create function metric_target(p_rule jsonb) returns numeric
language sql immutable as $$
  select coalesce((p_rule->>'gte')::numeric, (p_rule->>'lte')::numeric)
$$;

create function rule_satisfied(p_value numeric, p_rule jsonb) returns boolean
language sql immutable as $$
  select case
    when p_rule ? 'gte' then p_value >= (p_rule->>'gte')::numeric
    when p_rule ? 'lte' then p_value <= (p_rule->>'lte')::numeric
    else false end
$$;

-- Number of sessions a module holds (the target for module_sessions goals).
create function module_session_count(p_module_id uuid) returns integer
language sql stable as $$ select count(*)::integer from sessions where module_id = p_module_id $$;

create function goal_target(p_goal jsonb) returns numeric
language sql stable as $$
  select case when p_goal->>'metric' = 'module_sessions' then module_session_count((p_goal->>'module_id')::uuid)
    else metric_target(p_goal) end
$$;

-- ---------------------------------------------------------------- badges

create function award_badge(p_user_id uuid, p_badge_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b badges;
begin
  select * into b from badges where id = p_badge_id;
  insert into user_badges (user_id, badge_id, awarded_at) values (p_user_id, p_badge_id, p_at)
  on conflict do nothing;
  if not found then return null; end if;
  if b.coins > 0 then perform earn_coins(p_user_id, b.coins, 'badge', b.id); end if;
  return jsonb_build_object('id', b.id, 'slug', b.slug, 'name', b.name, 'description', b.description,
    'family', b.family, 'coins', b.coins, 'icon', b.icon);
end $$;

-- Evaluate every unearned badge of a phase ('completion' inside complete_drill,
-- 'weekly' from week_rollover). Returns the badges awarded now.
create function evaluate_badges(p_user_id uuid, p_phase text default 'completion', p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b badges; out jsonb := '[]'::jsonb; j jsonb;
begin
  for b in
    select * from badges where active and evaluated_on = p_phase
      and not exists (select 1 from user_badges ub where ub.user_id = p_user_id and ub.badge_id = badges.id)
    order by sort
  loop
    if rule_satisfied(metric_value(p_user_id, b.rule, '-infinity', 'infinity', p_at), b.rule) then
      j := award_badge(p_user_id, b.id, p_at);
      if j is not null then out := out || j; end if;
    end if;
  end loop;
  return out;
end $$;

-- Locked and unlocked state of every badge for an athlete (trophy case).
create function badges_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'slug', b.slug, 'name', b.name, 'description', b.description, 'family', b.family,
    'coins', b.coins, 'icon', b.icon, 'earned', ub.awarded_at is not null, 'awarded_at', ub.awarded_at,
    'progress', case when ub.awarded_at is null and b.rule ? 'gte' and b.evaluated_on = 'completion'
      then jsonb_build_object('value', metric_value(p_user_id, b.rule, '-infinity', 'infinity', p_at), 'target', metric_target(b.rule)) end
  ) order by b.sort), '[]'::jsonb)
  from badges b left join user_badges ub on ub.badge_id = b.id and ub.user_id = p_user_id
  where b.active
$$;

-- ---------------------------------------------------------------- challenges

create function challenge_row(ch challenges, cp challenge_progress, p_at timestamptz) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', ch.id, 'type', ch.type, 'title', ch.title, 'description', ch.description,
    'window_start', ch.window_start, 'window_end', ch.window_end, 'program_id', ch.program_id,
    'reward', jsonb_build_object('xp', ch.reward_xp, 'coins', ch.reward_coins, 'badge_id', ch.badge_id,
      'badge', (select name from badges where id = ch.badge_id)),
    'progress', coalesce(cp.progress, 0), 'target', coalesce(cp.target, goal_target(ch.goal)),
    'completed', cp.completed_at is not null, 'completed_at', cp.completed_at,
    'joined', (select count(*) from challenge_progress x where x.challenge_id = ch.id and x.progress > 0),
    'state', case when cp.completed_at is not null then 'complete'
                  when ch.window_end <= p_at then 'missed' else 'active' end)
$$;

-- Recompute progress on every challenge live for this athlete; award on completion.
create function update_challenge_progress(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ch challenges; cp challenge_progress; v numeric; t numeric; out jsonb := '[]'::jsonb; j jsonb; newly boolean;
begin
  for ch in
    select * from challenges c
    where c.window_start <= p_at and c.window_end > p_at
      and (c.type <> 'program' or exists (select 1 from enrollments e where e.user_id = p_user_id and e.program_id = c.program_id))
      and (c.type <> 'paid' or has_access(p_user_id, 'challenge', c.id, p_at))
    order by c.type, c.window_start
  loop
    v := metric_value(p_user_id, ch.goal, ch.window_start, ch.window_end, p_at);
    t := goal_target(ch.goal);
    insert into challenge_progress (challenge_id, user_id, progress, target, updated_at)
    values (ch.id, p_user_id, v, t, p_at)
    on conflict (challenge_id, user_id) do update set progress = excluded.progress, target = excluded.target, updated_at = p_at
    returning * into cp;
    newly := false;
    if cp.completed_at is null and (
         (ch.goal ? 'gte' and v >= (ch.goal->>'gte')::numeric)
      or (ch.goal ? 'lte' and v <= (ch.goal->>'lte')::numeric)
      or (ch.goal->>'metric' = 'module_sessions' and v >= t)) then
      update challenge_progress set completed_at = p_at where challenge_id = ch.id and user_id = p_user_id returning * into cp;
      newly := true;
      if ch.reward_xp > 0 then perform award_xp(p_user_id, ch.reward_xp, 'challenge', ch.id, user_local_date(p_user_id, p_at), p_at); end if;
      if ch.reward_coins > 0 then perform earn_coins(p_user_id, ch.reward_coins, 'challenge', ch.id); end if;
      if ch.badge_id is not null then perform award_badge(p_user_id, ch.badge_id, p_at); end if;
    end if;
    j := challenge_row(ch, cp, p_at) || jsonb_build_object('newly_completed', newly);
    out := out || j;
  end loop;
  return out;
end $$;

create function challenges_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active', coalesce((select jsonb_agg(challenge_row(ch, cp, p_at) order by ch.type, ch.window_start)
      from challenges ch left join challenge_progress cp on cp.challenge_id = ch.id and cp.user_id = p_user_id
      where ch.window_start <= p_at and ch.window_end > p_at
        and (ch.type <> 'program' or exists (select 1 from enrollments e where e.user_id = p_user_id and e.program_id = ch.program_id))), '[]'::jsonb),
    'completed', coalesce((select jsonb_agg(challenge_row(ch, cp, p_at) order by cp.completed_at desc)
      from challenges ch join challenge_progress cp on cp.challenge_id = ch.id and cp.user_id = p_user_id
      where cp.completed_at is not null), '[]'::jsonb),
    'missed', coalesce((select jsonb_agg(challenge_row(ch, cp, p_at) order by ch.window_end desc)
      from challenges ch join challenge_progress cp on cp.challenge_id = ch.id and cp.user_id = p_user_id
      where cp.completed_at is null and ch.window_end <= p_at), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- complete_drill (plan 6.8)

create function complete_drill_for(
  p_user_id uuid, p_drill_id uuid, p_session_id uuid, p_completed_at timestamptz,
  p_score numeric, p_watch_pct numeric, p_client_event_id text, p_received_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_existing jsonb;
  d drills;
  s sessions;
  p programs;
  e enrollments;
  tz text := user_timezone(p_user_id);
  v_completed_at timestamptz := least(p_completed_at, p_received_at + interval '5 minutes');
  v_date date;
  v_today date := local_date(p_received_at, tz);
  v_late boolean;
  c drill_completions;
  x xp_ledger;
  v_xp jsonb := '[]'::jsonb;
  v_drill_xp integer := 0;
  v_prev_best numeric;
  v_session_complete boolean := false;
  v_session_drills integer := 0;
  v_session_done integer := 0;
  v_sc session_completions;
  v_base integer := 0;
  v_streak_before integer := 0;
  v_streak_after integer := 0;
  v_bonus integer := 0;
  v_mult integer := 0;
  v_stats user_stats;
  v_old_level integer;
  v_new_level integer;
  v_total integer;
  v_coins_before integer;
  v_badges jsonb := '[]'::jsonb;
  v_challenges jsonb := '[]'::jsonb;
  v_program jsonb := null;
  v_program_done boolean := false;
  v_rank jsonb := null;
  v_result jsonb;
  v_free_today uuid;
  v_session_kind text := 'adhoc';
begin
  -- 1. idempotency
  select result into v_existing from drill_completions where user_id = p_user_id and client_event_id = p_client_event_id;
  if found then return v_existing || jsonb_build_object('duplicate', true); end if;

  perform ensure_user_stats(p_user_id);
  perform 1 from user_stats where user_id = p_user_id for update;

  -- 2. access and facts
  select * into d from drills where id = p_drill_id and status = 'published';
  if not found then raise exception 'drill_not_found' using errcode = 'P0002'; end if;
  if p_session_id is not null then
    select * into s from sessions where id = p_session_id;
    if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
    if not exists (select 1 from session_drills where session_id = s.id and drill_id = d.id) then
      raise exception 'drill_not_in_session' using errcode = 'P0002';
    end if;
    select * into p from programs where id = s.program_id;
    if not has_access(p_user_id, 'program', p.id, p_received_at) then raise exception 'program_locked' using errcode = 'P0003'; end if;
  end if;
  if not has_access(p_user_id, 'drill', d.id, p_received_at) then raise exception 'drill_locked' using errcode = 'P0003'; end if;

  v_date := local_date(v_completed_at, tz);
  v_late := p_received_at - v_completed_at > make_interval(hours => config_int('streak.late_sync_hours', p_received_at));
  v_free_today := free_drill_of_day(v_date);

  -- settle unjudged days before this one so a held freeze bridges a missed day first
  perform settle_missed_days(p_user_id, v_date - 1);

  insert into drill_completions (user_id, drill_id, session_id, completed_at, received_at, local_date, watch_pct, score, client_event_id)
  values (p_user_id, d.id, s.id, v_completed_at, p_received_at, v_date, p_watch_pct, p_score, p_client_event_id)
  returning * into c;

  -- 4a. drill XP, once per drill per local day
  if not exists (
    select 1 from xp_ledger x2 join drill_completions c2 on c2.id = x2.source_id
    where x2.user_id = p_user_id and x2.reason = 'drill' and x2.local_date = v_date and c2.drill_id = d.id) then
    x := award_xp(p_user_id, drill_xp(d, p_received_at), 'drill', c.id, v_date, p_received_at);
    v_drill_xp := x.amount;
    v_xp := v_xp || jsonb_build_object('reason', 'drill', 'amount', x.amount, 'requested', x.requested_amount, 'truncated', x.truncated, 'drill_id', d.id);
  else
    v_xp := v_xp || jsonb_build_object('reason', 'drill', 'amount', 0, 'requested', 0, 'truncated', false, 'drill_id', d.id, 'repeat', true);
  end if;

  -- 4b. personal best: numeric scores, the first score only sets the mark
  if p_score is not null and d.score_type = 'number' then
    select case d.score_direction when 'higher' then max(score) else min(score) end into v_prev_best
    from drill_completions where user_id = p_user_id and drill_id = d.id and score is not null and id <> c.id and completed_at < v_completed_at;
    if v_prev_best is not null
       and ((d.score_direction = 'higher' and p_score > v_prev_best) or (d.score_direction = 'lower' and p_score < v_prev_best))
       and not exists (select 1 from xp_ledger x2 join drill_completions c2 on c2.id = x2.source_id
                       where x2.user_id = p_user_id and x2.reason = 'personal_best' and x2.local_date = v_date and c2.drill_id = d.id) then
      x := award_xp(p_user_id, config_int('xp.personal_best', p_received_at), 'personal_best', c.id, v_date, p_received_at);
      v_xp := v_xp || jsonb_build_object('reason', 'personal_best', 'amount', x.amount, 'requested', x.requested_amount, 'truncated', x.truncated, 'drill_id', d.id, 'previous_best', v_prev_best, 'score', p_score);
    end if;
  end if;

  -- 3. session complete?
  if s.id is not null then
    v_session_kind := 'program';
    select count(*) into v_session_drills from session_drills where session_id = s.id;
    select count(distinct drill_id) into v_session_done from drill_completions where user_id = p_user_id and session_id = s.id and local_date = v_date;
    if v_session_done >= v_session_drills and not exists (select 1 from session_completions where user_id = p_user_id and local_date = v_date) then
      insert into session_completions (user_id, session_id, local_date, completed_at, counts_for_streak)
      values (p_user_id, s.id, v_date, v_completed_at, not v_late) returning * into v_sc;
      v_session_complete := true;
    end if;
  elsif d.id = v_free_today then
    v_session_kind := 'free';
    v_session_drills := 1; v_session_done := 1;
    if not exists (select 1 from session_completions where user_id = p_user_id and local_date = v_date) then
      insert into session_completions (user_id, free_drill_id, local_date, completed_at, counts_for_streak)
      values (p_user_id, d.id, v_date, v_completed_at, not v_late) returning * into v_sc;
      v_session_complete := true;
    end if;
  end if;

  v_streak_before := streak_run(p_user_id, v_date - 1);

  if v_session_complete then
    -- a late sync covering a frozen day refunds the freeze (plan 6.4)
    if v_sc.counts_for_streak and exists (select 1 from freeze_ledger where user_id = p_user_id and reason = 'used' and local_date = v_date)
       and not exists (select 1 from freeze_ledger where user_id = p_user_id and reason = 'refund' and local_date = v_date) then
      insert into freeze_ledger (user_id, amount, reason, local_date, source_id) values (p_user_id, 1, 'refund', v_date, v_sc.id);
    end if;

    -- session bonus, once per local day
    if not exists (select 1 from xp_ledger where user_id = p_user_id and reason = 'session_bonus' and local_date = v_date) then
      x := award_xp(p_user_id, config_int('xp.session_bonus', p_received_at), 'session_bonus', v_sc.id, v_date, p_received_at);
      v_bonus := x.requested_amount;
      v_xp := v_xp || jsonb_build_object('reason', 'session_bonus', 'amount', x.amount, 'requested', x.requested_amount, 'truncated', x.truncated);
    end if;

    -- streak multiplier on this session's drill XP plus the bonus (D14), with the streak the day started with
    if s.id is not null then
      select coalesce(sum(x2.requested_amount), 0) into v_base from xp_ledger x2 join drill_completions c2 on c2.id = x2.source_id
      where x2.user_id = p_user_id and x2.reason = 'drill' and x2.local_date = v_date and c2.session_id = s.id;
    else
      v_base := drill_xp(d, p_received_at);
    end if;
    v_base := v_base + v_bonus;
    v_mult := multiplier_bonus(v_base, v_streak_before, p_received_at);
    if v_mult > 0 then
      x := award_xp(p_user_id, v_mult, 'streak_multiplier', v_sc.id, v_date, p_received_at);
      v_xp := v_xp || jsonb_build_object('reason', 'streak_multiplier', 'amount', x.amount, 'requested', x.requested_amount, 'truncated', x.truncated,
        'streak', v_streak_before, 'factor', 1 + streak_multiplier(v_streak_before, p_received_at));
    end if;

    -- advance the enrolment; program completion on the last session
    if s.id is not null then
      select * into e from enrollments where user_id = p_user_id and program_id = s.program_id;
      if found and e.id is not null and s.day_number >= e.current_day then
        update enrollments set current_day = s.day_number + 1, last_completed_local_date = v_date, last_completed_session_id = s.id,
          completed_at = case when s.day_number >= p.duration_days
            or not exists (select 1 from sessions where program_id = p.id and day_number > s.day_number) then coalesce(completed_at, p_received_at) else completed_at end
        where id = e.id returning * into e;
        if e.completed_at is not null and not exists (select 1 from xp_ledger where user_id = p_user_id and reason = 'program_complete' and source_id = p.id) then
          x := award_xp(p_user_id, coalesce(p.completion_xp, config_int('xp.program_complete', p_received_at)), 'program_complete', p.id, v_date, p_received_at);
          v_xp := v_xp || jsonb_build_object('reason', 'program_complete', 'amount', x.amount, 'requested', x.requested_amount, 'truncated', false, 'program_id', p.id);
          v_program_done := true;
        end if;
      elsif found and e.id is not null then
        update enrollments set last_completed_local_date = greatest(coalesce(last_completed_local_date, v_date), v_date) where id = e.id returning * into e;
      end if;
      if e.id is not null then
        v_program := jsonb_build_object('enrollment_id', e.id, 'program_id', p.id, 'title', p.title, 'current_day', e.current_day,
          'duration_days', p.duration_days, 'completed', e.completed_at is not null, 'just_completed', v_program_done);
      end if;
    end if;
  end if;

  -- 5. user_stats: streak from facts, total XP, level, coins on level-up
  select coins into v_coins_before from user_stats where user_id = p_user_id;
  v_stats := recompute_streak(p_user_id, v_today);
  v_streak_after := case when v_session_complete and v_sc.counts_for_streak then streak_run(p_user_id, v_date) else v_stats.current_streak end;
  v_old_level := level_for_xp((select total_xp from user_stats where user_id = p_user_id), p_received_at);
  v_total := total_xp(p_user_id);
  v_new_level := level_for_xp(v_total, p_received_at);
  if v_new_level > v_old_level then
    perform earn_coins(p_user_id, config_int('xp.level_up_coins', p_received_at) * (v_new_level - v_old_level), 'level_up', c.id);
  end if;
  update user_stats set total_xp = v_total, level = v_new_level, updated_at = now() where user_id = p_user_id;

  -- 6. challenges, badges
  v_challenges := update_challenge_progress(p_user_id, p_received_at);
  v_total := total_xp(p_user_id);            -- a challenge may have paid XP
  v_new_level := level_for_xp(v_total, p_received_at);
  v_badges := evaluate_badges(p_user_id, 'completion', p_received_at);
  update user_stats set total_xp = v_total, level = v_new_level, coins = coin_balance(p_user_id), updated_at = now() where user_id = p_user_id
  returning * into v_stats;

  select jsonb_build_object('week_start', week_start, 'rank', rank, 'xp', xp, 'rank_day_start', rank_day_start) into v_rank
  from leaderboard_weekly where user_id = p_user_id and scope = 'global' and week_start = ist_week_start(p_received_at);

  v_result := jsonb_build_object(
    'completion_id', c.id, 'drill_id', d.id, 'session_id', s.id, 'local_date', v_date, 'late', v_late, 'duplicate', false,
    'xp', v_xp,
    'xp_earned', (select coalesce(sum((r->>'amount')::integer), 0) from jsonb_array_elements(v_xp) r),
    'daily_total', daily_capped_xp(p_user_id, v_date), 'daily_cap', config_int('xp.daily_cap', p_received_at),
    'level', level_progress(v_total, p_received_at) || jsonb_build_object('before', v_old_level, 'after', v_new_level,
      'title_before', rank_title(v_old_level, p_received_at), 'leveled_up', v_new_level > v_old_level),
    'streak', jsonb_build_object('before', v_streak_before, 'after', v_streak_after, 'current', v_stats.current_streak,
      'best', v_stats.best_streak, 'freezes_held', v_stats.freezes_held, 'multiplier', 1 + streak_multiplier(v_streak_before, p_received_at),
      'extended', v_session_complete and v_sc.counts_for_streak),
    'session', jsonb_build_object('kind', v_session_kind, 'complete', v_session_complete, 'drills_done', v_session_done, 'drills_total', v_session_drills,
      'bonus_awarded', v_bonus > 0),
    'challenges', v_challenges, 'badges', v_badges,
    'coins_earned', v_stats.coins - coalesce(v_coins_before, 0), 'coins_balance', v_stats.coins,
    'program', v_program, 'rank', v_rank);

  update drill_completions set result = v_result where id = c.id;
  return v_result;
end $$;

create function complete_drill(
  p_drill_id uuid, p_session_id uuid, p_completed_at timestamptz, p_score numeric, p_watch_pct numeric, p_client_event_id text
) returns jsonb
language sql security definer set search_path = public as $$
  select complete_drill_for(require_user_id(), p_drill_id, p_session_id, p_completed_at, p_score, p_watch_pct, p_client_event_id)
$$;

-- ---------------------------------------------------------------- media (rule 5)

create function get_drill_media_for(p_user_id uuid, p_drill_id uuid, p_session_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d drills;
begin
  select * into d from drills where id = p_drill_id and status = 'published';
  if not found then raise exception 'drill_not_found' using errcode = 'P0002'; end if;
  if p_session_id is not null and not exists (select 1 from session_drills where session_id = p_session_id and drill_id = d.id) then
    raise exception 'drill_not_in_session' using errcode = 'P0002';
  end if;
  if p_session_id is not null and not has_access(p_user_id, 'program', (select program_id from sessions where id = p_session_id), p_at) then
    raise exception 'program_locked' using errcode = 'P0003';
  end if;
  if not has_access(p_user_id, 'drill', d.id, p_at) then raise exception 'drill_locked' using errcode = 'P0003'; end if;
  return jsonb_build_object('drill_id', d.id, 'provider', d.video_provider, 'ref', d.video_ref, 'thumbnail_url', d.thumbnail_url,
    'duration_minutes', d.duration_minutes, 'done_threshold', config_num('video.done_threshold', p_at));
end $$;

create function get_drill_media(p_drill_id uuid, p_session_id uuid default null) returns jsonb
language sql security definer set search_path = public as $$
  select get_drill_media_for(require_user_id(), p_drill_id, p_session_id)
$$;

-- ---------------------------------------------------------------- rewards (plan 6.5, P0 spends)

create function purchase_reward_for(p_user_id uuid, p_item_id uuid, p_drill_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it reward_items; d drills; v_price integer; v_ent entitlements; v_spend coin_ledger;
begin
  select * into it from reward_items where id = p_item_id and active;
  if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;
  if it.kind = 'freeze' then
    if freezes_held(p_user_id) >= config_int('streak.freeze_max_held', p_at) then
      raise exception 'freeze_cap_reached' using errcode = 'P0004';
    end if;
    v_price := it.coin_price;
    v_spend := spend_coins(p_user_id, v_price, 'spend_freeze', it.id);
    perform add_freeze(p_user_id, 'coin_purchase', null, v_spend.id);
  elsif it.kind = 'drill_unlock' then
    select * into d from drills where id = p_drill_id and status = 'published';
    if not found then raise exception 'drill_not_found' using errcode = 'P0002'; end if;
    if has_access(p_user_id, 'drill', d.id, p_at) then raise exception 'already_unlocked' using errcode = 'P0004'; end if;
    v_price := coalesce(d.coin_price, it.coin_price);
    v_spend := spend_coins(p_user_id, v_price, 'spend_drill_unlock', d.id);
    v_ent := grant_entitlement(p_user_id, 'drill', d.id, 'coins', p_at, null, v_spend.id::text, null, null, 'coins');
  else
    raise exception 'not_available_yet' using errcode = 'P0004';   -- frames, vouchers, real-world: phase 10
  end if;
  update user_stats set coins = coin_balance(p_user_id), freezes_held = freezes_held(p_user_id), updated_at = now() where user_id = p_user_id;
  return jsonb_build_object('item_id', it.id, 'kind', it.kind, 'coins_spent', v_price,
    'coins_balance', coin_balance(p_user_id), 'freezes_held', freezes_held(p_user_id), 'entitlement_id', v_ent.id);
end $$;

create function purchase_reward(p_item_id uuid, p_drill_id uuid default null) returns jsonb
language sql security definer set search_path = public as $$
  select purchase_reward_for(require_user_id(), p_item_id, p_drill_id)
$$;

create function rewards_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'coins', coin_balance(p_user_id),
    'coins_this_week', (select coalesce(sum(amount), 0) from coin_ledger where user_id = p_user_id and amount > 0 and created_at >= local_day_start(ist_week_start(p_at), 'Asia/Kolkata')),
    'freezes_held', freezes_held(p_user_id), 'freeze_max', config_int('streak.freeze_max_held', p_at),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'kind', kind, 'title', title, 'description', description,
      'coin_price', coin_price, 'per_user_limit', per_user_limit, 'per_user_period', per_user_period,
      'available', kind in ('freeze', 'drill_unlock'), 'affordable', coin_price <= coin_balance(p_user_id)) order by sort)
      from reward_items where active), '[]'::jsonb),
    'redemptions', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'item_id', r.item_id, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
      from redemptions r where r.user_id = p_user_id), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- Home (plan 7: one request)

create function streak_state_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := user_timezone(p_user_id);
  v_today date := local_date(p_at, tz);
  v_now time := local_time(p_at, tz);
  v_done boolean := exists (select 1 from session_completions where user_id = p_user_id and local_date = v_today and counts_for_streak);
  v_current integer := current_streak(p_user_id, v_today);
  v_best integer := best_streak(p_user_id);
  v_frozen_yesterday boolean := exists (select 1 from streak_days(p_user_id) sd where sd.d = v_today - 1 and not sd.completed);
  v_last date := (select max(local_date) from session_completions where user_id = p_user_id and counts_for_streak);
  v_state text;
  v_last_run integer := 0;
begin
  if v_done then v_state := 'done';
  elsif v_current > 0 and v_frozen_yesterday then v_state := 'frozen';
  elsif v_current = 0 and v_last is not null and v_last >= v_today - 7 then v_state := 'ended';
  elsif v_current >= config_int('streak.at_risk_min_streak', p_at) and v_now >= config_text('streak.nudge_time', p_at)::time then v_state := 'at_risk';
  else v_state := 'pending';
  end if;
  if v_state = 'ended' then v_last_run := streak_run(p_user_id, v_last); end if;
  return jsonb_build_object('current', v_current, 'best', v_best, 'state', v_state,
    'freezes_held', freezes_held(p_user_id), 'freeze_max', config_int('streak.freeze_max_held', p_at),
    'multiplier', 1 + streak_multiplier(case when v_done then streak_run(p_user_id, v_today - 1) else v_current end, p_at),
    'ends_at', local_day_start(v_today + 1, tz), 'frozen_day', case when v_frozen_yesterday then v_today - 1 end,
    'last_run', v_last_run, 'last_trained', v_last,
    'week', (select jsonb_agg(jsonb_build_object('date', g::date,
      'status', case when exists (select 1 from session_completions c where c.user_id = p_user_id and c.local_date = g::date and c.counts_for_streak) then 'done'
                     when exists (select 1 from streak_days(p_user_id) sd where sd.d = g::date and not sd.completed) then 'frozen'
                     when g::date = v_today then 'today' when g::date > v_today then 'future' else 'missed' end) order by g)
      from generate_series(v_today - 6, v_today, interval '1 day') g));
end $$;

create function weekly_rank_for(p_user_id uuid, p_scope text default 'global', p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('scope', l.scope, 'scope_value', l.scope_value, 'rank', l.rank, 'xp', l.xp,
    'rank_day_start', l.rank_day_start, 'delta', coalesce(l.rank_day_start - l.rank, 0),
    'of', (select count(*) from leaderboard_weekly x where x.week_start = l.week_start and x.scope = l.scope and x.scope_value = l.scope_value and x.is_public),
    'week_start', l.week_start)
  from leaderboard_weekly l
  where l.user_id = p_user_id and l.week_start = ist_week_start(p_at) and l.scope = p_scope
    and l.scope_value = case when p_scope = 'sport' then coalesce((select sport from profiles where id = p_user_id), '') else '' end
$$;

create function home_payload_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr profiles; st user_stats; tz text; v_today date; v_wc jsonb; v_enr jsonb;
begin
  select * into pr from profiles where id = p_user_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
  select * into st from user_stats where user_id = p_user_id;
  tz := pr.timezone; v_today := local_date(p_at, tz);
  select challenge_row(ch, cp, p_at) || jsonb_build_object('resets_at', ch.window_end) into v_wc
  from challenges ch left join challenge_progress cp on cp.challenge_id = ch.id and cp.user_id = p_user_id
  where ch.type = 'weekly' and ch.window_start <= p_at and ch.window_end > p_at order by ch.window_start desc limit 1;
  select jsonb_build_object('enrollment_id', e.id, 'program_id', p.id, 'slug', p.slug, 'title', p.title,
    'current_day', e.current_day, 'duration_days', p.duration_days, 'completed', e.completed_at is not null) into v_enr
  from enrollments e join programs p on p.id = e.program_id where e.user_id = p_user_id and e.is_active;
  return jsonb_build_object(
    'local_date', v_today, 'now', p_at, 'timezone', tz,
    'profile', jsonb_build_object('id', pr.id, 'display_name', pr.display_name, 'sport', pr.sport,
      'initials', upper(left(regexp_replace(pr.display_name, '^(\S)\S*\s*(\S?).*$', '\1\2'), 2)), 'visibility', pr.visibility),
    'today', todays_session_for(p_user_id, v_today, p_at),
    'streak', streak_state_for(p_user_id, p_at),
    'level', level_progress(coalesce(st.total_xp, 0), p_at),
    'coins', coalesce(st.coins, 0),
    'weekly_challenge', v_wc,
    'weekly_rank', coalesce(weekly_rank_for(p_user_id, 'sport', p_at), weekly_rank_for(p_user_id, 'global', p_at)),
    'program', v_enr);
end $$;

create function home_payload() returns jsonb
language sql security definer set search_path = public as $$
  select home_payload_for(require_user_id())
$$;

-- ---------------------------------------------------------------- Progress (board 8)

create function progress_payload_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := user_timezone(p_user_id);
  v_today date := local_date(p_at, tz);
  v_week date := ist_week_start(p_at);
  v_onboarded date := (select local_date(coalesce(onboarded_at, created_at), timezone) from profiles where id = p_user_id);
  v_day integer := v_today - v_onboarded + 1;
  v_due text := null;
begin
  if v_day >= 21 and not exists (select 1 from self_ratings where user_id = p_user_id and kind = 'day21') then v_due := 'day21';
  elsif v_day >= 14 and not exists (select 1 from self_ratings where user_id = p_user_id and kind = 'day14') then v_due := 'day14';
  end if;
  return jsonb_build_object(
    'local_date', v_today,
    'streak', jsonb_build_object('current', current_streak(p_user_id, v_today), 'best', best_streak(p_user_id)),
    'sessions_total', (select count(*) from session_completions where user_id = p_user_id),
    'minutes_total', (select coalesce(sum(d.duration_minutes), 0) from drill_completions c join drills d on d.id = c.drill_id where c.user_id = p_user_id),
    'weekly_target', config_int('progress.weekly_target', p_at),
    'weeks', (select jsonb_agg(jsonb_build_object('week_start', w::date,
        'sessions', (select count(*) from session_completions c where c.user_id = p_user_id and c.local_date >= w::date and c.local_date < w::date + 7),
        'minutes', (select coalesce(sum(d.duration_minutes), 0) from drill_completions c join drills d on d.id = c.drill_id
                    where c.user_id = p_user_id and c.local_date >= w::date and c.local_date < w::date + 7)) order by w)
      from generate_series(v_week - 49, v_week, interval '7 days') w),
    'calendar', (select jsonb_agg(jsonb_build_object('date', g::date,
        'status', case when exists (select 1 from session_completions c where c.user_id = p_user_id and c.local_date = g::date) then 'done'
                       when exists (select 1 from streak_days(p_user_id) sd where sd.d = g::date and not sd.completed) then 'frozen'
                       when g::date = v_today then 'today' when g::date < v_onboarded then 'before' else 'missed' end) order by g)
      from generate_series(v_today - 34, v_today, interval '1 day') g),
    'drills', coalesce((select jsonb_agg(jsonb_build_object('drill_id', d.id, 'title', d.title, 'unit', d.score_unit, 'direction', d.score_direction,
        'best', case d.score_direction when 'higher' then max(c.score) else min(c.score) end,
        'points', (select jsonb_agg(jsonb_build_object('date', c2.local_date, 'score', c2.score) order by c2.completed_at)
                   from drill_completions c2 where c2.user_id = p_user_id and c2.drill_id = d.id and c2.score is not null)) order by d.title)
      from drill_completions c join drills d on d.id = c.drill_id
      where c.user_id = p_user_id and c.score is not null and d.score_type = 'number' group by d.id), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'baseline', (select jsonb_object_agg(area, rating) from (select distinct on (area) area, rating from self_ratings where user_id = p_user_id and kind = 'baseline' order by area, taken_at desc) b),
      'latest', (select jsonb_object_agg(area, rating) from (select distinct on (area) area, rating from self_ratings where user_id = p_user_id order by area, taken_at desc) l),
      'due', v_due, 'day', v_day));
end $$;

create function progress_payload() returns jsonb
language sql security definer set search_path = public as $$
  select progress_payload_for(require_user_id())
$$;

reset role;
