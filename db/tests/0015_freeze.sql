-- Freezes: consumed on a missed day, refunded by a late sync, streak ends without one (plan 6.4)
select plan(14);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(10); u uuid := pg_temp.fx_user('frz'); v uuid := pg_temp.fx_user('nofrz');
begin
  -- 3 days ending 2026-10-07; 2026-10-08 missed; "today" is 2026-10-09
  perform pg_temp.fx_streak(u, p, 3, '2026-10-07');
  perform pg_temp.fx_streak(v, p, 3, '2026-10-07');
  -- bought before the missed day (a freeze bought later cannot cover a day already gone)
  return next ok(add_freeze(u, 'coin_purchase', null, null, '2026-10-07 10:00+05:30'), 'a freeze is added');
  return next ok(add_freeze(u, 'coin_purchase', null, null, '2026-10-07 10:00+05:30'), 'a second one too');
  return next ok(not add_freeze(u, 'coin_purchase', null, null, '2026-10-07 10:00+05:30'), 'the third freeze is refused (cap 2)');
  return next is(freezes_held(u), 2, 'two held');
  return next is(settle_missed_days(u, '2026-10-08'), 1, 'streak_close consumes one freeze for the missed day');
  return next is(freezes_held(u), 1, 'one left');
  return next is(current_streak(u, '2026-10-09'), 3, 'the streak is held through the frozen day');
  return next is(settle_missed_days(u, '2026-10-08'), 0, 'judging the same day again consumes nothing');
  return next is(settle_missed_days(v, '2026-10-08'), 0, 'without a freeze nothing is consumed');
  return next is(current_streak(v, '2026-10-09'), 0, 'and the streak is 0');
  return next is(best_streak(v), 3, 'best streak is kept');
  -- Late sync for the frozen day refunds the freeze and the day counts as trained.
  perform pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 4), '2026-10-08 19:00+05:30', '2026-10-09 09:00+05:30');
  return next is(freezes_held(u), 2, 'the freeze used on 2026-10-08 is refunded');
  return next is(streak_run(u, '2026-10-08'), 4, 'the streak now counts the late day');
  return next is((select current_streak from user_stats where user_id = u), 4, 'user_stats carries the recomputed streak as of the sync day');
end $$;
select pg_temp.t();
select * from finish();
