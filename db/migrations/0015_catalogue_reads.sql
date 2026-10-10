-- Phase 4 · read endpoints the admin's result is checked through (plan phase 4, section 7):
--   GET /programs, GET /programs/:slug, GET /sessions/:id.
-- Same shape as the phase 1 payloads: public functions read the athlete from app.user_id,
-- internal *_for functions take it explicitly and are granted to eyeq_service only.
-- SECURITY DEFINER (owner eyeq_owner) bypasses RLS, so every query filters to published
-- content itself. Rule 5: no function here reads or returns drills.video_ref; the only way
-- out for it stays get_drill_media.
set role eyeq_owner;

-- One program's catalogue card: the access fields of 5.2, counts, the measurement tags and
-- groups its drills cover (the catalogue filters by group, phase 5), and the athlete's state.
create function program_card_for(p_user_id uuid, p_program programs, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p_program.id, 'slug', p_program.slug, 'title', p_program.title, 'description', p_program.description,
    'cover_url', p_program.cover_url, 'sport_tags', to_jsonb(p_program.sport_tags), 'level', p_program.level,
    'duration_days', p_program.duration_days, 'min_level', p_program.min_level, 'coach_line', p_program.coach_line,
    'is_free', p_program.is_free, 'in_subscription', p_program.in_subscription,
    'product', (select jsonb_build_object('id', pr.id, 'price_paise', pr.price_paise, 'currency', pr.currency)
                from products pr where pr.id = p_program.product_id and pr.active),
    'module_count', (select count(*) from modules m where m.program_id = p_program.id),
    'session_count', (select count(*) from sessions s where s.program_id = p_program.id),
    'drill_count', (select count(*) from session_drills sd join sessions s on s.id = sd.session_id where s.program_id = p_program.id),
    'measurement_tags', coalesce((
      select jsonb_agg(distinct d.measurement_tag order by d.measurement_tag)
      from session_drills sd join sessions s on s.id = sd.session_id join drills d on d.id = sd.drill_id
      where s.program_id = p_program.id and d.measurement_tag is not null), '[]'::jsonb),
    'measurement_groups', coalesce((
      select jsonb_agg(distinct mt."group" order by mt."group")
      from session_drills sd join sessions s on s.id = sd.session_id join drills d on d.id = sd.drill_id
      join measurement_tags mt on mt.slug = d.measurement_tag
      where s.program_id = p_program.id), '[]'::jsonb),
    'has_access', has_access(p_user_id, 'program', p_program.id, p_at),
    'enrollment', (select jsonb_build_object('current_day', e.current_day, 'is_active', e.is_active,
                     'started_at', e.started_at, 'completed_at', e.completed_at)
                   from enrollments e where e.user_id = p_user_id and e.program_id = p_program.id))
$$;

-- GET /programs: every published program, in catalogue order (free first, then title).
create function catalog_programs_for(p_user_id uuid, p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(program_card_for(p_user_id, p, p_at) order by p.is_free desc, p.title), '[]'::jsonb)
  from programs p where p.status = 'published'
$$;

-- GET /programs/:slug: the card plus modules and their sessions. Null when the slug is
-- unknown or the program is a draft, so a draft reads exactly like a missing program.
create function program_detail_for(p_user_id uuid, p_slug text, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p programs; e enrollments; v_today date;
begin
  select * into p from programs where slug = p_slug and status = 'published';
  if not found then return null; end if;
  select * into e from enrollments where user_id = p_user_id and program_id = p.id;
  v_today := user_local_date(p_user_id, p_at);
  return program_card_for(p_user_id, p, p_at) || jsonb_build_object('modules', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', m.id, 'order', m."order", 'title', m.title, 'description', m.description,
        'unlock_rule', m.unlock_rule, 'unlock_day', m.unlock_day,
        -- Unlock state only means something once enrolled.
        'unlocked', case when e.id is null then null else module_unlocked(p_user_id, m.id, e, v_today) end,
        'sessions', coalesce((
          select jsonb_agg(jsonb_build_object(
              'id', s.id, 'day_number', s.day_number, 'title', s.title, 'est_minutes', s.est_minutes,
              'drill_count', (select count(*) from session_drills sd where sd.session_id = s.id),
              'xp', (select coalesce(sum(drill_xp(d, p_at)), 0) from session_drills sd join drills d on d.id = sd.drill_id where sd.session_id = s.id),
              'completed', exists (select 1 from session_completions c where c.user_id = p_user_id and c.session_id = s.id))
            order by s.day_number)
          from sessions s where s.module_id = m.id), '[]'::jsonb))
      order by m."order")
    from modules m where m.program_id = p.id), '[]'::jsonb));
end $$;

-- GET /sessions/:id: the session and its drills as the player needs them, with the
-- athlete's lock state per drill. Never video_ref (rule 5). Null for a session of a draft
-- program or an unknown id.
create function session_detail_for(p_user_id uuid, p_session_id uuid, p_at timestamptz default now()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s sessions; p programs; m modules;
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
      select jsonb_agg(jsonb_build_object(
          'id', d.id, 'order', sd."order", 'title', d.title,
          'video_provider', d.video_provider, 'thumbnail_url', d.thumbnail_url,
          'instructions', to_jsonb(d.instructions),
          'target_type', d.target_type, 'target_value', d.target_value, 'target_label', d.target_label,
          'rest_seconds', d.rest_seconds, 'duration_minutes', d.duration_minutes,
          'score_type', d.score_type, 'score_direction', d.score_direction, 'score_unit', d.score_unit,
          'xp', drill_xp(d, p_at),
          'measurement', case when mt.slug is null then null
                              else jsonb_build_object('slug', mt.slug, 'name', mt.name, 'group', mt."group") end,
          'access', d.access, 'coin_price', coalesce(d.coin_price, config_int('coin.drill_unlock_price', p_at)),
          'ppv_product_id', d.ppv_product_id,
          'locked', not has_access(p_user_id, 'drill', d.id, p_at))
        order by sd."order")
      from session_drills sd
      join drills d on d.id = sd.drill_id and d.status = 'published'
      left join measurement_tags mt on mt.slug = d.measurement_tag
      where sd.session_id = s.id), '[]'::jsonb));
end $$;

-- Public wrappers: the athlete is always app.user_id.
create function catalog_programs() returns jsonb
language sql stable security definer set search_path = public as $$ select catalog_programs_for(require_user_id()) $$;
create function program_detail(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$ select program_detail_for(require_user_id(), p_slug) $$;
create function session_detail(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$ select session_detail_for(require_user_id(), p_session_id) $$;

-- PUBLIC holds no EXECUTE on eyeq_owner functions (default privileges, 0002).
grant execute on function catalog_programs(), program_detail(text), session_detail(uuid) to eyeq_api;
grant execute on function program_card_for(uuid, programs, timestamptz), catalog_programs_for(uuid, timestamptz),
  program_detail_for(uuid, text, timestamptz), session_detail_for(uuid, uuid, timestamptz) to eyeq_service;

reset role;
