-- Phase 4 · admin athletes: list with search and plan filter, athlete page (plan phase 4).
--  1. Contact helpers over auth.users, owned by the migration user (like the 0014 foreign
--     key: on Supabase, postgres can read auth.users and eyeq_owner cannot be granted it).
--     They return a masked phone only (rule 11), or user ids for a phone search.
--  2. List and detail payloads for the coach admin, eyeq_service only. Date of birth is
--     never returned (rule 11): only whether the athlete is a minor.

-- ---------------------------------------------------------------- 1. contact helpers
-- "+91 ••••• •3210": the country code and the last four digits, nothing else.
create function athlete_phones_masked(p_user_ids uuid[]) returns table (user_id uuid, phone_masked text)
language sql stable security definer set search_path = public, auth as $$
  select u.id,
    case
      when coalesce(u.phone, '') = '' then null
      when length(regexp_replace(u.phone, '\D', '', 'g')) <= 4 then '••••'
      else '+' || left(regexp_replace(u.phone, '\D', '', 'g'), greatest(length(regexp_replace(u.phone, '\D', '', 'g')) - 10, 0))
           || ' ••••• •' || right(regexp_replace(u.phone, '\D', '', 'g'), 4)
    end
  from auth.users u where u.id = any (p_user_ids)
$$;

-- Athletes whose phone contains these digits (at least four), for the admin search box.
create function athletes_by_phone(p_digits text) returns setof uuid
language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u
  where length(regexp_replace(coalesce(p_digits, ''), '\D', '', 'g')) >= 4
    and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_digits, '\D', '', 'g') || '%'
$$;

revoke execute on function athlete_phones_masked(uuid[]), athletes_by_phone(text) from public;
grant execute on function athlete_phones_masked(uuid[]), athletes_by_phone(text) to eyeq_owner, eyeq_service;

-- ---------------------------------------------------------------- 2. payloads
set role eyeq_owner;

-- Pro (an active subscription), Program (an active program entitlement) or Free.
create function athlete_plan(p_user_id uuid, p_at timestamptz default now()) returns text
language sql stable security definer set search_path = public as $$
  select case
    when has_active_subscription(p_user_id, p_at) then 'pro'
    when exists (select 1 from entitlements e where e.user_id = p_user_id and e.scope = 'program'
                 and e.status in ('active', 'grace') and e.starts_at <= p_at and (e.ends_at is null or e.ends_at > p_at)) then 'program'
    else 'free' end
$$;

create function athlete_last_active(p_user_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(received_at) from drill_completions where user_id = p_user_id
$$;

-- One row of the athletes table (board 17).
create function athlete_row(p profiles, p_phone text, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name,
    'initials', upper(left(regexp_replace(p.display_name, '^(\S)\S*\s*(\S?).*$', '\1\2'), 2)),
    'phone_masked', p_phone, 'sport', p.sport, 'playing_level', p.playing_level,
    'current_streak', coalesce(st.current_streak, 0), 'best_streak', coalesce(st.best_streak, 0),
    'level', coalesce(st.level, 1), 'total_xp', coalesce(st.total_xp, 0),
    'last_active_at', athlete_last_active(p.id),
    'plan', athlete_plan(p.id, p_at),
    'program', (select jsonb_build_object('slug', pr.slug, 'title', pr.title, 'current_day', e.current_day, 'duration_days', pr.duration_days)
                from enrollments e join programs pr on pr.id = e.program_id
                where e.user_id = p.id and e.is_active limit 1),
    'joined_at', p.created_at)
  from (select 1) one
  left join user_stats st on st.user_id = p.id
$$;

-- GET /api/admin/athletes: search by name, or by phone digits (four or more), filter by
-- plan, newest activity first. p_limit 0 returns every match (CSV export). The header's
-- "active this week" counts every athlete with a drill in the last seven days.
create function admin_athletes_for(p_search text default null, p_plan text default null,
  p_limit integer default 50, p_offset integer default 0, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[]; v_total integer; v_rows jsonb;
begin
  if p_plan is not null and p_plan not in ('pro', 'program', 'free') then
    raise exception 'plan must be pro, program or free' using errcode = '22023';
  end if;
  select array_agg(p.id order by athlete_last_active(p.id) desc nulls last, p.created_at desc) into v_ids
  from profiles p
  where (coalesce(trim(p_search), '') = ''
         or p.display_name ilike '%' || trim(p_search) || '%'
         or p.id in (select athletes_by_phone(p_search)))
    and (p_plan is null or athlete_plan(p.id, p_at) = p_plan);
  v_total := coalesce(array_length(v_ids, 1), 0);
  if p_limit > 0 then v_ids := v_ids[p_offset + 1 : p_offset + p_limit]; end if;
  select coalesce(jsonb_agg(athlete_row(p, ph.phone_masked, p_at) order by ord.n), '[]'::jsonb) into v_rows
  from unnest(coalesce(v_ids, '{}')) with ordinality ord (id, n)
  join profiles p on p.id = ord.id
  left join athlete_phones_masked(v_ids) ph on ph.user_id = p.id;
  return jsonb_build_object('total', v_total,
    'active_this_week', (select count(distinct user_id) from drill_completions
                         where received_at > p_at - interval '7 days' and received_at <= p_at),
    'athletes', v_rows);
end $$;

-- GET /api/admin/athletes/:id: the row plus enrolments, entitlements with their events,
-- purchases and an activity timeline (newest 50 items).
create function admin_athlete_detail_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles; v_phone text;
begin
  select * into p from profiles where id = p_user_id;
  if not found then return null; end if;
  select phone_masked into v_phone from athlete_phones_masked(array[p_user_id]);
  return athlete_row(p, v_phone, p_at) || jsonb_build_object(
    'is_minor', is_minor(p.dob), 'timezone', p.timezone, 'visibility', p.visibility,
    'onboarded_at', p.onboarded_at, 'coins', (select coins from user_stats where user_id = p_user_id),
    'freezes_held', (select freezes_held from user_stats where user_id = p_user_id),
    'enrollments', coalesce((
      select jsonb_agg(jsonb_build_object('program_id', pr.id, 'slug', pr.slug, 'title', pr.title, 'current_day', e.current_day,
          'duration_days', pr.duration_days, 'is_active', e.is_active, 'started_at', e.started_at, 'completed_at', e.completed_at)
        order by e.started_at desc)
      from enrollments e join programs pr on pr.id = e.program_id where e.user_id = p_user_id), '[]'::jsonb),
    'entitlements', coalesce((
      select jsonb_agg(jsonb_build_object('id', en.id, 'scope', en.scope, 'scope_id', en.scope_id,
          'scope_title', case en.scope when 'program' then (select title from programs where id = en.scope_id)
                                       when 'drill' then (select title from drills where id = en.scope_id) end,
          'source', en.source, 'status', en.status, 'starts_at', en.starts_at, 'ends_at', en.ends_at,
          'active', en.status in ('active', 'grace') and en.starts_at <= p_at and (en.ends_at is null or en.ends_at > p_at),
          'events', (select jsonb_agg(jsonb_build_object('change', ev.change, 'reason', ev.reason, 'admin_id', ev.admin_id, 'at', ev.at) order by ev.seq)
                     from entitlement_events ev where ev.entitlement_id = en.id))
        order by en.created_at desc)
      from entitlements en where en.user_id = p_user_id), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(t.item order by t.at desc)
      from (
        select x.at, x.item from (
          select c.completed_at as at, jsonb_build_object('kind', 'session', 'at', c.completed_at, 'title',
                   coalesce((select pr.title || ' · Day ' || s.day_number from sessions s join programs pr on pr.id = s.program_id where s.id = c.session_id), 'Free drill of the day')) as item
            from session_completions c where c.user_id = p_user_id
          union all
          select xl.created_at, jsonb_build_object('kind', 'xp', 'at', xl.created_at, 'amount', xl.amount, 'reason', xl.reason)
            from xp_ledger xl where xl.user_id = p_user_id and xl.reason in ('session_bonus', 'challenge', 'program_complete', 'admin')
          union all
          select ub.awarded_at, jsonb_build_object('kind', 'badge', 'at', ub.awarded_at, 'title', b.name)
            from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = p_user_id
          union all
          select ev.at, jsonb_build_object('kind', 'entitlement', 'at', ev.at, 'change', ev.change, 'scope', en.scope, 'source', en.source)
            from entitlement_events ev join entitlements en on en.id = ev.entitlement_id where en.user_id = p_user_id
          union all
          select cl.created_at, jsonb_build_object('kind', 'coins', 'at', cl.created_at, 'amount', cl.amount, 'reason', cl.reason)
            from coin_ledger cl where cl.user_id = p_user_id and cl.amount < 0
        ) x order by x.at desc limit 50
      ) t), '[]'::jsonb));
end $$;

grant execute on function athlete_plan(uuid, timestamptz), athlete_last_active(uuid), athlete_row(profiles, text, timestamptz),
  admin_athletes_for(text, text, integer, integer, timestamptz), admin_athlete_detail_for(uuid, timestamptz) to eyeq_service;

reset role;
