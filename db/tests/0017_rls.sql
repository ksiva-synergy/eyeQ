-- eyeq_api cannot write ledgers or caches; one athlete cannot read another's rows (plan 5.3)
select plan(12);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(1); a uuid := pg_temp.fx_user('alice'); b uuid := pg_temp.fx_user('bob');
begin
  perform pg_temp.fx_complete_session(a, pg_temp.fx_session(p, 1), now() - interval '2 hours');
  perform pg_temp.fx_complete_session(b, pg_temp.fx_session(p, 1), now() - interval '2 hours');
  set local role eyeq_api;
  perform set_config('app.user_id', a::text, true);
  return next is((select count(*) from xp_ledger), (select count(*) from xp_ledger where user_id = a), 'alice sees only her XP rows');
  return next is((select count(*) from profiles), 1::bigint, 'alice sees one profile');
  return next is((select count(*) from session_completions where user_id = b), 0::bigint, 'alice cannot see bob''s completions');
  return next throws_ok(format('insert into xp_ledger (user_id, amount, requested_amount, reason, local_date) values (%L, 500, 500, %L, current_date)', a, 'admin'), '42501', null, 'api cannot insert XP');
  return next throws_ok(format('insert into coin_ledger (user_id, amount, reason) values (%L, 500, %L)', a, 'admin'), '42501', null, 'api cannot insert coins');
  return next throws_ok('update user_stats set total_xp = 99999', '42501', null, 'api cannot update user_stats');
  return next throws_ok(format('insert into entitlements (user_id, scope, scope_id, source) values (%L, %L, %L, %L)', a, 'program', p, 'admin'), '42501', null, 'api cannot insert entitlements');
  return next throws_ok('select video_ref from drills limit 1', '42501', null, 'api cannot read video_ref (rule 5)');
  return next lives_ok('select title from drills limit 1', 'api can read the rest of drills');
  return next throws_ok(format('select complete_drill_for(%L, null, null, now(), null, null, %L)', b, 'x'), '42501', null, 'api cannot call the internal *_for functions');
  perform set_config('app.user_id', '', true);
  return next throws_ok('select home_payload()', '28000', null, 'public functions need an athlete in context');
  reset role;
  set local role eyeq_owner;
  return next is((select count(*) from xp_ledger where user_id in (a, b)), 10::bigint, 'the owner sees both athletes'' rows (4 drills + bonus each)');
end $$;
select pg_temp.t();
select * from finish();
