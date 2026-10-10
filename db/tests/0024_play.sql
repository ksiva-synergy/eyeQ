-- Today's session, enrolment, program completion, personal bests, media (plan 6.3, 6.8, rule 5)
select plan(17);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(2, true, 2); u uuid := pg_temp.fx_user('play'); e jsonb; t jsonb; s1 uuid; d1 uuid; d2 uuid; r0 jsonb; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb;
begin
  e := enroll_for(u, p);
  return next is(e->>'current_day', '1', 'enrolled on day 1');
  t := todays_session_for(u, current_date);
  return next is(t->>'kind', 'program', 'today is a program session');
  return next is(t->>'day_number', '1', 'day 1');
  return next is(t->'xp_preview'->>'total', '45', '2 drills + bonus, no multiplier');
  return next ok(not (t->'drills'->0 ? 'video_ref'), 'no video_ref in the session payload');
  s1 := pg_temp.fx_session(p, 1); d1 := (pg_temp.fx_drills(s1))[1]; d2 := (pg_temp.fx_drills(s1))[2];
  r0 := complete_drill_for(u, d1, s1, now() - interval '3 days', 20, 1, 'pb-0', now() - interval '3 days');
  return next is((select count(*) from jsonb_array_elements(r0->'xp') x where x->>'reason' = 'personal_best'), 0::bigint, 'first score sets the mark, no PB XP');
  r1 := complete_drill_for(u, d1, s1, now() - interval '1 hour', 22, 1, 'pb-1');
  return next is((select x->>'amount' from jsonb_array_elements(r1->'xp') x where x->>'reason' = 'personal_best'), '15', 'a better score earns 15 XP');
  r2 := complete_drill_for(u, d1, s1, now() - interval '50 minutes', 30, 1, 'pb-2');
  return next is((select count(*) from jsonb_array_elements(r2->'xp') x where x->>'reason' = 'personal_best'), 0::bigint, 'a second PB the same day earns nothing');
  return next is((select x->>'amount' from jsonb_array_elements(r2->'xp') x where x->>'reason' = 'drill'), '0', 'a repeat drill the same day earns 0');
  r3 := complete_drill_for(u, d2, s1, now() - interval '40 minutes', null, 1, 'pb-3');
  return next is(r3->'session'->>'complete', 'true', 'session complete after the second drill');
  return next is(r3->'program'->>'current_day', '2', 'enrolment advanced');
  return next is(r3->'streak'->>'after', '1', 'streak 1');
  return next is((todays_session_for(u, current_date))->>'completed', 'true', 'today shows as done');
  r4 := pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 2), local_day_start(current_date + 1, 'Asia/Kolkata') + interval '19 hours');
  return next is(r4->'program'->>'just_completed', 'true', 'program completed on the last session');
  return next is((select amount from xp_ledger where user_id = u and reason = 'program_complete'), 500, 'program completion pays 500 XP (uncapped)');
  insert into drills (id, title, video_provider, video_ref, access) values ('00000000-0000-4000-a000-00000000ee01', 'ppv', 'drive', 'secret', 'ppv');
  return next is(get_drill_media_for(u, d1, s1)->>'ref', (select video_ref from drills where id = d1), 'media for an accessible drill');
  return next throws_like(format('select get_drill_media_for(%L, %L)', u, '00000000-0000-4000-a000-00000000ee01'), 'drill_locked', 'no media for a locked drill');
end $$;
select pg_temp.t();
select * from finish();
