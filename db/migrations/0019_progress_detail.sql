-- Phase 5 · Progress (board 8): what the screen draws that the payload did not carry.
--   calendar[].minutes      minutes trained each day, for the heatmap's shades
--   ratings.baseline_at,    when the baseline and the latest ratings were taken
--   ratings.latest_at
--   level                   XP and level, for board 16's stat tile
-- Additive keys only, so the previous release (which strips unknown keys) keeps working
-- while this migration runs ahead of its deploy (plan 2.4).
set role eyeq_owner;

create or replace function progress_payload_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
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
        'minutes', (select coalesce(sum(d.duration_minutes), 0) from drill_completions c join drills d on d.id = c.drill_id
                    where c.user_id = p_user_id and c.local_date = g::date),
        'status', case when exists (select 1 from session_completions c where c.user_id = p_user_id and c.local_date = g::date) then 'done'
                       when exists (select 1 from streak_days(p_user_id) sd where sd.d = g::date and not sd.completed) then 'frozen'
                       when g::date = v_today then 'today' when g::date < v_onboarded then 'before' else 'missed' end) order by g)
      from generate_series(v_today - 34, v_today, interval '1 day') g),
    'drills', coalesce((select jsonb_agg(jsonb_build_object('drill_id', x.id, 'title', x.title, 'unit', x.score_unit,
        'direction', x.score_direction, 'best', x.best,
        'points', (select jsonb_agg(jsonb_build_object('date', c2.local_date, 'score', c2.score) order by c2.completed_at)
                   from drill_completions c2 where c2.user_id = p_user_id and c2.drill_id = x.id and c2.score is not null)) order by x.title)
      from (select d.id, d.title, d.score_unit, d.score_direction,
                   case d.score_direction when 'higher' then max(c.score) else min(c.score) end as best
            from drill_completions c join drills d on d.id = c.drill_id
            where c.user_id = p_user_id and c.score is not null and d.score_type = 'number'
            group by d.id) x), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'baseline', (select jsonb_object_agg(area, rating) from (select distinct on (area) area, rating from self_ratings where user_id = p_user_id and kind = 'baseline' order by area, taken_at desc) b),
      'latest', (select jsonb_object_agg(area, rating) from (select distinct on (area) area, rating from self_ratings where user_id = p_user_id order by area, taken_at desc) l),
      'baseline_at', (select max(taken_at) from self_ratings where user_id = p_user_id and kind = 'baseline'),
      'latest_at', (select max(taken_at) from self_ratings where user_id = p_user_id),
      'due', v_due, 'day', v_day),
    'level', level_progress(total_xp(p_user_id), p_at));
end $$;

reset role;
