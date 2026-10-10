-- Shared fixtures, loaded before every test file by the runner. Temp functions only.

create function pg_temp.fx_user(p_name text, p_tz text default 'Asia/Kolkata', p_sport text default 'cricket', p_vis text default 'public', p_dob date default '2000-01-01') returns uuid
language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into profiles (id, display_name, sport, timezone, visibility, dob, onboarded_at, created_at)
  values (v, p_name, p_sport, p_tz, p_vis, p_dob, now() - interval '60 days', now() - interval '60 days');
  perform ensure_user_stats(v);
  return v;
end $$;

create function pg_temp.fx_tag() returns void language sql as $$
  insert into measurement_tags (slug, name, "group") values ('executive-scan', 'Executive Scan', 'cognition') on conflict do nothing;
  insert into measurement_tags (slug, name, "group") values ('dynamic-visual-acuity', 'Dynamic Visual Acuity', 'vision') on conflict do nothing;
$$;

-- A published program with one module (immediate) and p_days sessions of p_drills fresh drills each.
create function pg_temp.fx_program(p_days integer default 3, p_free boolean default true, p_drills integer default 4, p_in_sub boolean default false) returns uuid
language plpgsql as $$
declare v_p uuid := gen_random_uuid(); v_m uuid := gen_random_uuid(); v_s uuid; v_d uuid; d integer; k integer;
begin
  perform pg_temp.fx_tag();
  insert into programs (id, slug, title, duration_days, is_free, in_subscription, status) values (v_p, 'p-' || v_p, 'Program ' || left(v_p::text, 8), p_days, p_free, p_in_sub, 'published');
  insert into modules (id, program_id, "order", title, unlock_rule) values (v_m, v_p, 1, 'Module 1', 'immediate');
  for d in 1..p_days loop
    v_s := gen_random_uuid();
    insert into sessions (id, program_id, module_id, day_number, est_minutes) values (v_s, v_p, v_m, d, 14);
    for k in 1..p_drills loop
      v_d := gen_random_uuid();
      insert into drills (id, title, video_provider, video_ref, measurement_tag, access, duration_minutes, score_type, score_direction)
      values (v_d, format('Drill %s.%s', d, k), 'youtube', 'ref-' || v_d, case when k = 1 then 'executive-scan' else 'dynamic-visual-acuity' end, 'included', 3, 'number', 'higher');
      insert into session_drills (session_id, drill_id, "order") values (v_s, v_d, k);
    end loop;
  end loop;
  return v_p;
end $$;

create function pg_temp.fx_session(p_program uuid, p_day integer) returns uuid
language sql as $$ select id from sessions where program_id = p_program and day_number = p_day $$;

create function pg_temp.fx_drills(p_session uuid) returns uuid[]
language sql as $$ select array_agg(drill_id order by "order") from session_drills where session_id = p_session $$;

-- Complete every drill of a session as p_user at p_at (device time), received at p_received.
create function pg_temp.fx_complete_session(p_user uuid, p_session uuid, p_at timestamptz, p_received timestamptz default null, p_score numeric default null) returns jsonb
language plpgsql as $$
declare v_d uuid; r jsonb; i integer := 0;
begin
  foreach v_d in array pg_temp.fx_drills(p_session) loop
    i := i + 1;
    r := complete_drill_for(p_user, v_d, p_session, p_at + make_interval(mins => i), p_score, 1.0, format('%s-%s-%s', p_session, v_d, p_at), coalesce(p_received, p_at + make_interval(mins => i + 1)));
  end loop;
  return r;
end $$;

-- Enrol and complete consecutive days ending on p_last_day (IST evenings).
create function pg_temp.fx_streak(p_user uuid, p_program uuid, p_days integer, p_last_day date, p_tz text default 'Asia/Kolkata') returns void
language plpgsql as $$
declare d integer; s uuid;
begin
  insert into enrollments (user_id, program_id, started_at, start_local_date) values (p_user, p_program, local_day_start(p_last_day - p_days + 1, p_tz), p_last_day - p_days + 1)
  on conflict (user_id, program_id) do nothing;
  for d in 1..p_days loop
    s := pg_temp.fx_session(p_program, d);
    perform pg_temp.fx_complete_session(p_user, s, local_day_start(p_last_day - p_days + d, p_tz) + interval '19 hours');
  end loop;
end $$;

create function pg_temp.vec(p_name text) returns jsonb language sql as $$ select data from test_vectors where name = p_name $$;
