-- Functions no other test called (measured with track_functions = all over db:test and
-- db:test:integration, before phase 6). Each is called here once with fixture data and
-- its effect checked, so a function that fails when first called fails here, not in a job.
select plan(28);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  u uuid := pg_temp.fx_user('uncalled');
  other uuid := pg_temp.fx_user('uncalled-other');
  p uuid := pg_temp.fx_program(3);
  s uuid := pg_temp.fx_session(p, 1);
  today date := local_date(now(), 'Asia/Kolkata');
  item uuid;
  r jsonb;
  pe uuid;
  n integer;
begin
  -- streak_close (nightly job): three days trained, ending three days ago, one freeze held.
  perform pg_temp.fx_streak(u, p, 3, today - 3);
  -- granted before the missed days, or it could not have covered them
  perform add_freeze(u, 'sub_grant', null, null, now() - interval '4 days');
  n := streak_close(now());
  return next ok(n >= 1, 'streak_close judges at least one athlete');
  return next is((select last_judged_local_date from user_stats where user_id = u), today - 1,
    'streak_close judges the athlete through yesterday');
  return next is((select count(*)::integer from freeze_ledger where user_id = u and reason = 'used'), 1,
    'streak_close spends the one freeze on the first missed day');
  perform streak_close(now());
  return next is((select count(*)::integer from freeze_ledger where user_id = u and reason = 'used'), 1,
    'a second streak_close the same night changes nothing');

  -- streak_days lists the trained days.
  return next is((select count(*)::integer from streak_days(u) where completed), 3, 'streak_days lists the three trained days');

  -- rank_day_snapshot (daily job) and leaderboard_compute.
  perform pg_temp.fx_complete_session(other, s, now() - interval '10 minutes');
  return next ok(exists (select 1 from leaderboard_compute(now()) where user_id = other and scope = 'global'),
    'leaderboard_compute ranks an athlete with XP this week');
  n := rank_day_snapshot(now());
  return next ok(n >= 1, 'rank_day_snapshot updates this week''s rows');
  return next ok((select rank_day_start = rank from leaderboard_weekly
                  where user_id = other and scope = 'global' and week_start = ist_week_start(now())),
    'rank_day_snapshot records the rank at the start of the day');

  -- rebuild_all_user_stats (rule 3) leaves the cache as it was.
  create temp table before_stats on commit drop as select * from user_stats where user_id in (u, other);
  n := rebuild_all_user_stats();
  return next is(n, (select count(*)::integer from profiles), 'rebuild_all_user_stats rebuilds every profile');
  return next ok(not exists (
      select user_id, total_xp, level, current_streak, best_streak, freezes_held, coins, credits from before_stats
      except
      select user_id, total_xp, level, current_streak, best_streak, freezes_held, coins, credits from user_stats where user_id in (u, other)),
    'rebuild_all_user_stats equals the cache');

  -- spend_credits.
  insert into credit_ledger (user_id, amount, reason) values (u, 5, 'admin');
  perform spend_credits(u, 3, 'spend');
  return next is(credit_balance(u), 2, 'spend_credits takes from the balance');
  return next throws_ok(format('select spend_credits(%L, 3, %L)', u, 'spend'), 'P0001', null,
    'spend_credits refuses more than the balance');

  -- purchase_reward_for: a freeze bought with coins.
  insert into reward_items (slug, kind, title, coin_price) values ('t-freeze', 'freeze', 'Freeze', 100) returning id into item;
  insert into coin_ledger (user_id, amount, reason) values (other, 150, 'admin');
  r := purchase_reward_for(other, item);
  return next is((r->>'coins_spent')::integer, 100, 'purchase_reward_for charges the price');
  return next is(coin_balance(other), (select coalesce(sum(amount), 0)::integer from coin_ledger where user_id = other),
    'the coin balance is the ledger');
  return next is((r->>'freezes_held')::integer, freezes_held(other), 'the bought freeze is held');

  -- rewards_for, challenges_for.
  return next ok(jsonb_typeof(rewards_for(u)) = 'object', 'rewards_for returns the rewards payload');
  return next ok(jsonb_typeof(challenges_for(u)) in ('object', 'array'), 'challenges_for returns the challenges payload');

  -- check_rate_limit: the second hit in a window of one is refused.
  return next ok(check_rate_limit('t:' || u, 1, 3600), 'check_rate_limit allows the first hit');
  return next ok(not check_rate_limit('t:' || u, 1, 3600), 'check_rate_limit refuses the second');

  -- payment_events (rule 2, near-ledger): processing fields may be set, the payload never
  -- changes, and no row is deleted.
  insert into payment_events (provider, external_id, event_type, payload)
    values ('razorpay', 'evt_t_' || u, 'payment.captured', '{"amount": 100}') returning id into pe;
  update payment_events set processed_at = now(), attempts = attempts + 1, last_error = null where id = pe;
  return next is((select attempts from payment_events where id = pe), 1, 'payment_events processing fields can be set');
  return next throws_ok(format('update payment_events set payload = %L where id = %L', '{"amount": 1}', pe), '42501', null,
    'a payment event''s payload never changes');
  return next throws_ok(format('update payment_events set external_id = %L where id = %L', 'other', pe), '42501', null,
    'nor its provider event id');
  return next throws_ok(format('delete from payment_events where id = %L', pe), '42501', null,
    'a payment event is never deleted');

  -- The athlete-facing wrappers, as eyeq_api with app.user_id.
  set local role eyeq_api;
  perform set_config('app.user_id', other::text, true);
  return next lives_ok('select my_rewards(), my_challenges(), todays_session()', 'my_rewards, my_challenges and todays_session run for the caller');
  return next is(session_detail(s)->>'id', s::text, 'session_detail returns the session');
  return next ok((my_leaderboard()->'me'->>'rank') is not null, 'my_leaderboard has the caller''s rank');
  -- purchase_reward buys for the caller: 50 coins left, so the 100-coin freeze is refused.
  return next throws_ok(format('select purchase_reward(%L)', item), 'P0001', null,
    'purchase_reward refuses what the caller cannot afford');
  return next throws_ok(format('select purchase_reward(%L)', gen_random_uuid()), 'P0002', null,
    'purchase_reward refuses an unknown item');
  reset role;
end $$;
select pg_temp.t();
select * from finish();
