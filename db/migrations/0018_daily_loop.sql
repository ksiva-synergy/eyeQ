-- Phase 5 · the daily loop: what the athlete web app needs beyond the phase 1 payloads.
--   session_play_for    session detail whose drills also say whether they are done today, so
--                       a session resumes where the athlete left it. A new function rather
--                       than a change to session_detail_for: the previous release's strict
--                       contract would refuse the new key while this migration runs ahead of
--                       its deploy (plan 2.4)
--   drill_detail_for    one drill outside a session (the free drill of the day, D20); like
--                       every athlete payload it never reads video_ref (rule 5)
--   progress            fixes progress_payload_for, which could not run (see below)
--   minors private      a profile is created on the first request, before the date of birth
--                       is known, so the insert-time default (0004) never sees it; setting a
--                       date of birth that makes the athlete a minor now makes them private on
--                       boards too (plan 6.6, D11); they can still choose public in Profile
--                       afterwards, which changes visibility without touching dob
set role eyeq_owner;

-- One drill as the athlete sees it (the shape of GET /sessions/:id drills).
create function athlete_drill_json(p_user_id uuid, d drills, p_order integer, p_done boolean, p_at timestamptz default now()) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', d.id, 'order', p_order, 'title', d.title,
    'video_provider', d.video_provider, 'thumbnail_url', d.thumbnail_url,
    'instructions', to_jsonb(d.instructions),
    'target_type', d.target_type, 'target_value', d.target_value, 'target_label', d.target_label,
    'rest_seconds', d.rest_seconds, 'duration_minutes', d.duration_minutes,
    'score_type', d.score_type, 'score_direction', d.score_direction, 'score_unit', d.score_unit,
    'xp', drill_xp(d, p_at),
    'measurement', (select jsonb_build_object('slug', mt.slug, 'name', mt.name, 'group', mt."group")
                    from measurement_tags mt where mt.slug = d.measurement_tag),
    'access', d.access, 'coin_price', coalesce(d.coin_price, config_int('coin.drill_unlock_price', p_at)),
    'ppv_product_id', d.ppv_product_id,
    'locked', not has_access(p_user_id, 'drill', d.id, p_at),
    'done_today', p_done)
$$;

create function session_play_for(p_user_id uuid, p_session_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions; p programs; m modules; v_today date := user_local_date(p_user_id, p_at);
begin
  select * into s from sessions where id = p_session_id;
  if not found then return null; end if;
  select * into p from programs where id = s.program_id and status = 'published';
  if not found then return null; end if;
  select * into m from modules where id = s.module_id;
  return jsonb_build_object(
    'id', s.id, 'day_number', s.day_number, 'title', s.title, 'est_minutes', s.est_minutes,
    'program', jsonb_build_object('id', p.id, 'slug', p.slug, 'title', p.title,
      'has_access', has_access(p_user_id, 'program', p.id, p_at)),
    'module', jsonb_build_object('id', m.id, 'order', m."order", 'title', m.title),
    'drills', coalesce((
      select jsonb_agg(athlete_drill_json(p_user_id, d, sd."order",
          exists (select 1 from drill_completions c where c.user_id = p_user_id and c.drill_id = d.id
                  and c.session_id = s.id and c.local_date = v_today), p_at)
        order by sd."order")
      from session_drills sd
      join drills d on d.id = sd.drill_id and d.status = 'published'
      where sd.session_id = s.id), '[]'::jsonb));
end $$;

create function drill_detail_for(p_user_id uuid, p_drill_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d drills; v_today date := user_local_date(p_user_id, p_at);
begin
  select * into d from drills where id = p_drill_id and status = 'published';
  if not found then return null; end if;
  return athlete_drill_json(p_user_id, d, 1,
      exists (select 1 from drill_completions c where c.user_id = p_user_id and c.drill_id = d.id and c.local_date = v_today), p_at)
    || jsonb_build_object('free_today', d.id is not distinct from free_drill_of_day(v_today));
end $$;

create function session_play(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$ select session_play_for(require_user_id(), p_session_id) $$;
create function drill_detail(p_drill_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$ select drill_detail_for(require_user_id(), p_drill_id) $$;

grant execute on function session_play(uuid), drill_detail(uuid) to eyeq_api;
grant execute on function athlete_drill_json(uuid, drills, integer, boolean, timestamptz),
  session_play_for(uuid, uuid, timestamptz), drill_detail_for(uuid, uuid, timestamptz) to eyeq_service;

-- ---------------------------------------------------------------- Progress (board 8)
-- 0009's progress_payload_for nested max() inside jsonb_agg(), which Postgres refuses
-- ("aggregate function calls cannot be nested"); no test called it before phase 5. Same
-- payload, with each drill's best computed in a grouped subquery first.

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
      'due', v_due, 'day', v_day));
end $$;

-- ---------------------------------------------------------------- minors private (D11)

create function profiles_minor_private_on_dob() returns trigger
language plpgsql as $$
begin
  if old.dob is null and new.dob is not null and is_minor(new.dob)
     and new.visibility is not distinct from old.visibility then
    new.visibility := 'private';
  end if;
  return new;
end $$;

create trigger profiles_minor_private before update of dob on profiles
  for each row execute function profiles_minor_private_on_dob();

reset role;
