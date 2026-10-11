-- Phase 5: session detail says which drills are done today, drill detail for the free drill,
-- progress with scores, and a minor's date of birth makes a profile private on boards (0018)
select plan(15);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  t timestamptz := '2026-03-04 13:00+00';            -- 18:30 IST
  u uuid := pg_temp.fx_user('player');
  p uuid := pg_temp.fx_program(2, true, 3);
  s uuid; d uuid[]; sd jsonb; dd jsonb; free_d uuid; m uuid;
begin
  s := pg_temp.fx_session(p, 1);
  d := pg_temp.fx_drills(s);
  perform enroll_for(u, p, t - interval '1 day');
  perform complete_drill_for(u, d[1], s, t, null, 1.0, 'dl-1', t);

  -- scores on a numeric drill: progress lists the drill, its points and its best
  perform complete_drill_for(u, d[2], s, t + interval '1 minute', 12, 1.0, 'dl-2', t + interval '1 minute');
  perform complete_drill_for(u, d[2], s, t + interval '2 minutes', 15, 1.0, 'dl-3', t + interval '2 minutes');
  return next is(jsonb_array_length((progress_payload_for(u, t))->'drills'), 1, 'progress lists each scored drill once');
  return next is((progress_payload_for(u, t))->'drills'->0->>'best', '15', 'progress gives the best score in the drill''s direction');
  return next is(jsonb_array_length((progress_payload_for(u, t))->'drills'->0->'points'), 2, 'progress gives every scored point');

  sd := session_detail_for(u, s, t + interval '3 minutes');
  return next is(sd->'drills'->0->>'done_today', 'true', 'a drill done today says so');
  return next is(sd->'drills'->2->>'done_today', 'false', 'a drill not yet done says so');
  return next is((session_detail_for(u, s, t + interval '1 day'))->'drills'->0->>'done_today', 'false', 'done_today is per local day');

  dd := drill_detail_for(u, d[2], t);
  return next is(dd->>'id', d[2]::text, 'drill detail returns the drill');
  return next is(dd->>'locked', 'false', 'a drill of a free program is unlocked');
  return next ok(dd::text not like '%video_ref%' and dd::text not like '%' || (select video_ref from drills where id = d[2]) || '%',
    'drill detail carries no video reference (rule 5)');
  return next is(drill_detail_for(u, gen_random_uuid(), t), null::jsonb, 'an unknown drill reads as missing');

  free_d := gen_random_uuid();
  insert into drills (id, title, video_provider, video_ref, access, duration_minutes, score_type, score_direction)
  values (free_d, 'Pool drill', 'youtube', 'ref-pool', 'free_pool', 3, 'rating', 'higher');
  update drills set status = 'draft' where access = 'free_pool' and id <> free_d;
  return next is((drill_detail_for(u, free_d, t))->>'free_today', 'true', 'the free drill of the day is marked');

  -- Minors: the profile row exists before the date of birth is known (first request).
  m := gen_random_uuid();
  perform pg_temp.fx_auth_user(m);
  insert into profiles (id, display_name) values (m, 'Young');
  return next is((select visibility from profiles where id = m), 'public', 'a profile without a date of birth starts public');
  update profiles set dob = (current_date - interval '15 years')::date where id = m;
  return next is((select visibility from profiles where id = m), 'private', 'setting a minor''s date of birth makes them private');
  update profiles set visibility = 'public' where id = m;
  return next is((select visibility from profiles where id = m), 'public', 'a minor can still choose public afterwards');
  update profiles set dob = '2000-01-01' where id = u;
  return next is((select visibility from profiles where id = u), 'public', 'an adult''s date of birth leaves visibility alone');
end $$;
select pg_temp.t();
select * from finish();
