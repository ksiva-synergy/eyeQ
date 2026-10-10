-- A duplicate client_event_id returns the first result and writes nothing (rule 6)
select plan(6);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(1); u uuid := pg_temp.fx_user('idem'); s uuid; d uuid; r1 jsonb; r2 jsonb;
begin
  s := pg_temp.fx_session(p, 1); d := (pg_temp.fx_drills(s))[1];
  r1 := complete_drill_for(u, d, s, now() - interval '1 minute', null, 1.0, 'evt-1');
  r2 := complete_drill_for(u, d, s, now() - interval '1 minute', null, 1.0, 'evt-1');
  return next is(r1->>'duplicate', 'false', 'first call is not a duplicate');
  return next is(r2->>'duplicate', 'true', 'second call with the same client_event_id is a duplicate');
  return next is(r2->>'completion_id', r1->>'completion_id', 'the stored result is returned');
  return next is((select count(*) from drill_completions where user_id = u), 1::bigint, 'one completion row');
  return next is((select count(*) from xp_ledger where user_id = u), 1::bigint, 'one XP row');
  return next is(r1->>'xp_earned', '10', 'the drill earned 10 XP');
end $$;
select pg_temp.t();
select * from finish();
