-- Phase 5 Progress (0019): minutes per calendar day, when ratings were taken, and the level
select plan(6);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  t timestamptz := '2026-03-04 13:00+00';            -- 18:30 IST, Wednesday
  u uuid := pg_temp.fx_user('progress');
  p uuid := pg_temp.fx_program(2, true, 4);           -- two days, so day 1 does not finish it
  s uuid := pg_temp.fx_session(p, 1);
  pp jsonb; today jsonb;
begin
  perform enroll_for(u, p, t - interval '1 day');
  perform pg_temp.fx_complete_session(u, s, t);       -- four drills of 3 minutes
  insert into self_ratings (user_id, area, rating, kind, taken_at) values
    (u, 'focus', 3, 'baseline', t - interval '10 days'), (u, 'reaction', 2, 'baseline', t - interval '10 days'),
    (u, 'tracking', 3, 'baseline', t - interval '10 days'), (u, 'focus', 4, 'adhoc', t - interval '1 day');

  pp := progress_payload_for(u, t + interval '10 minutes');
  select c into today from jsonb_array_elements(pp->'calendar') c where c->>'date' = '2026-03-04';
  return next is(today->>'minutes', '12', 'the calendar gives minutes trained on the day');
  return next is(today->>'status', 'done', 'and the day''s status');
  return next is((select (c->>'minutes')::int from jsonb_array_elements(pp->'calendar') c where c->>'date' = '2026-03-03'), 0, 'a day without training has 0 minutes');
  return next is((pp->'ratings'->>'baseline_at')::timestamptz, t - interval '10 days', 'the baseline''s date');
  return next is((pp->'ratings'->>'latest_at')::timestamptz, t - interval '1 day', 'the latest rating''s date');
  return next is((pp->'level'->>'total_xp')::int, 65, 'the level block carries total XP');
end $$;
select pg_temp.t();
select * from finish();
