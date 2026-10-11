-- Phase 6 acceptance with the clock moved: every job runs through cron_run (what pg_cron
-- calls), in Kolkata (UTC+5:30) and New York (UTC-5 in November). Schedules are UTC.
-- Then the dispatcher's claim and finish, the feed's read state, and coin drill unlocks.
select plan(58);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  p uuid := pg_temp.fx_program(10);
  -- missed day: 3-day streaks ending 3 Nov (local), 4 Nov missed
  ka_frz uuid := pg_temp.fx_user('KA freeze', 'Asia/Kolkata');
  ka_nof uuid := pg_temp.fx_user('KA none', 'Asia/Kolkata');
  ny_frz uuid := pg_temp.fx_user('NY freeze', 'America/New_York');
  ny_nof uuid := pg_temp.fx_user('NY none', 'America/New_York');
  -- at risk on 10 Nov
  risk_ka uuid := pg_temp.fx_user('Risk KA', 'Asia/Kolkata');
  risk_ny uuid := pg_temp.fx_user('Risk NY', 'America/New_York');
  trained uuid := pg_temp.fx_user('Trained', 'Asia/Kolkata');
  -- the 2-a-day cap on 12 Nov
  capped uuid := pg_temp.fx_user('Capped', 'Asia/Kolkata');
  -- challenge ending
  ce_ka uuid := pg_temp.fx_user('CE KA', 'Asia/Kolkata');
  ce_ny uuid := pg_temp.fx_user('CE NY', 'America/New_York');
  ce_done uuid := pg_temp.fx_user('CE done', 'Asia/Kolkata');
  -- rollover
  r1 uuid := pg_temp.fx_user('R1'); r2 uuid := pg_temp.fx_user('R2');
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid();
  ist_close timestamptz := '2026-11-04 18:40+00';   -- 00:10 on 5 Nov in Kolkata, 13:40 on 4 Nov in New York
  ny_close timestamptz := '2026-11-05 05:10+00';    -- 00:10 on 5 Nov in New York
  r jsonb;
begin
  -- ---------------------------------------------------------------- schedules (UTC)
  return next is((select count(*) from cron_jobs where jobname like 'eyeq-%'), 8::bigint, 'eight jobs are scheduled');
  return next is((select array_agg(jobname || ' ' || schedule order by jobname) from cron_jobs where jobname like 'eyeq-%'),
    array['eyeq-challenge-ending 0 * * * *', 'eyeq-daily-reminder */15 * * * *', 'eyeq-entitlement-expiry 0 * * * *',
          'eyeq-leaderboard-refresh */5 * * * *', 'eyeq-rank-day-snapshot 30 18 * * *', 'eyeq-streak-at-risk */15 * * * *',
          'eyeq-streak-close */15 * * * *', 'eyeq-week-rollover 30 18 * * 0'],
    'schedules as plan phase 6 writes them, in UTC (Monday 00:00 IST is 30 18 * * 0)');
  return next ok((select bool_and(command = format('select public.cron_run(%L)', substr(jobname, 6))) from cron_jobs where jobname like 'eyeq-%'),
    'each job calls cron_run with its own name');
  return next throws_ok($q$ select cron_run('no-such-job') $q$, '22023', 'unknown job no-such-job', 'an unknown job name fails loudly');

  -- ---------------------------------------------------------------- streak close, two zones
  perform pg_temp.fx_streak(ka_frz, p, 3, '2026-11-03');
  perform pg_temp.fx_streak(ka_nof, p, 3, '2026-11-03');
  perform pg_temp.fx_streak(ny_frz, p, 3, '2026-11-03', 'America/New_York');
  perform pg_temp.fx_streak(ny_nof, p, 3, '2026-11-03', 'America/New_York');
  perform add_freeze(ka_frz, 'coin_purchase', null, null, '2026-11-03 10:00+05:30');
  perform add_freeze(ny_frz, 'coin_purchase', null, null, '2026-11-03 10:00-05:00');

  r := cron_run('streak-close', ist_close);
  return next is(freezes_held(ka_frz), 0, 'Kolkata, just past midnight: the held freeze is consumed for the missed day');
  return next is(current_streak(ka_frz, '2026-11-05'), 3, 'and the streak is kept');
  return next is(current_streak(ka_nof, '2026-11-05'), 0, 'Kolkata without a freeze: the streak resets');
  return next is(best_streak(ka_nof), 3, 'and the best streak is kept');
  return next is(freezes_held(ny_frz), 1, 'New York is still on 4 Nov: its freeze is untouched');
  return next is((select last_judged_local_date from user_stats where user_id = ny_nof), '2026-11-03'::date, 'New York has been judged only through 3 Nov');

  r := cron_run('streak-close', ny_close);
  return next is(freezes_held(ny_frz), 0, 'New York, past its own midnight: the freeze is consumed');
  return next is(current_streak(ny_frz, '2026-11-05'), 3, 'and the streak is kept');
  return next is(current_streak(ny_nof, '2026-11-05'), 0, 'New York without a freeze: the streak resets');
  return next is(best_streak(ny_nof), 3, 'and the best streak is kept');
  r := cron_run('streak-close', ny_close + interval '15 minutes');
  return next is(freezes_held(ka_frz) + freezes_held(ny_frz), 0, 'the next run the same night consumes nothing more');

  -- ---------------------------------------------------------------- streak at risk at 20:00 local, two zones
  perform pg_temp.fx_streak(risk_ka, p, 4, '2026-11-09');
  perform pg_temp.fx_streak(risk_ny, p, 4, '2026-11-09', 'America/New_York');
  perform pg_temp.fx_streak(trained, p, 5, '2026-11-10');
  r := cron_run('streak-at-risk', '2026-11-10 14:35+00');            -- 20:05 Kolkata, 09:35 New York
  return next is((select status from notifications where user_id = risk_ka and kind = 'streak_at_risk'), 'queued', 'at 20:05 in Kolkata the at-risk notice is queued');
  return next is((select (data->>'streak')::integer from notifications where user_id = risk_ka and kind = 'streak_at_risk'), 4, 'carrying the streak at risk');
  return next ok(not exists (select 1 from notifications where user_id = risk_ny), 'not yet for New York (09:35 there)');
  return next ok(not exists (select 1 from notifications where user_id = trained), 'not for the athlete who trained today');
  return next ok(not exists (select 1 from notifications where user_id in (risk_ka, risk_ny, trained) and kind <> 'streak_at_risk'),
    'the at-risk job queues no other kind');
  r := cron_run('streak-at-risk', '2026-11-10 14:20+00');            -- 19:50 Kolkata: before the window
  r := cron_run('streak-at-risk', '2026-11-11 01:05+00');            -- 20:05 New York
  return next is((select status from notifications where user_id = risk_ny and kind = 'streak_at_risk'), 'queued', 'at 20:05 in New York it is queued there');
  return next is((select local_date from notifications where user_id = risk_ny), '2026-11-10'::date, 'on New York''s own date');
  return next is((select count(*) from notifications where user_id = risk_ka), 1::bigint, 'Kolkata still has exactly one');

  -- ---------------------------------------------------------------- a third push in a day is skipped and recorded
  perform pg_temp.fx_streak(capped, p, 4, '2026-11-11');
  insert into challenges (id, type, title, goal, window_start, window_end, reward_xp)
  values (c1, 'weekly', 'Cap week', '{"metric":"sessions_total","gte":99}', '2026-11-08 18:30+00', '2026-11-13 15:00+00', 10);
  insert into challenge_progress (challenge_id, user_id, progress, target) values (c1, capped, 4, 99);
  r := cron_run('daily-reminder', '2026-11-12 13:35+00');            -- 19:05 Kolkata (reminder 19:00)
  r := cron_run('streak-at-risk', '2026-11-12 14:35+00');            -- 20:05
  r := cron_run('challenge-ending', '2026-11-12 15:00+00');          -- 20:30, 24 h before the window closes
  return next is((select array_agg(kind || ':' || status || coalesce(':' || last_error, '') order by kind) from notifications where user_id = capped),
    array['challenge_ending:skipped:daily_cap', 'daily_reminder:queued', 'streak_at_risk:queued'],
    'the third push of the day is skipped and recorded with its reason');

  -- ---------------------------------------------------------------- challenge ending, 24 h before close, two zones
  insert into challenges (id, type, title, goal, window_start, window_end, reward_xp)
  values (c2, 'weekly', 'Ending week', '{"metric":"sessions_total","gte":99}', '2026-11-15 18:30+00', '2026-11-20 18:00+00', 10);
  insert into challenge_progress (challenge_id, user_id, progress, target, completed_at) values
    (c2, ce_ka, 1, 99, null), (c2, ce_ny, 1, 99, null), (c2, ce_done, 99, 99, '2026-11-18 10:00+00');
  r := cron_run('challenge-ending', '2026-11-19 17:00+00');          -- 25 h before
  return next ok(not exists (select 1 from notifications where user_id in (ce_ka, ce_ny, ce_done) and kind = 'challenge_ending'), '25 hours before the close nothing is queued');
  r := cron_run('challenge-ending', '2026-11-19 18:00+00');          -- 24 h before
  return next is((select status from notifications where user_id = ce_ka and kind = 'challenge_ending'), 'queued', '24 hours before the close: queued for the Kolkata athlete who has not finished');
  return next is((select status from notifications where user_id = ce_ny and kind = 'challenge_ending'), 'queued', 'and for the New York athlete');
  return next is((select local_date from notifications where user_id = ce_ny and kind = 'challenge_ending'), '2026-11-19'::date, 'dated on New York''s calendar');
  return next ok(not exists (select 1 from notifications where user_id = ce_done and kind = 'challenge_ending'), 'not for the athlete who finished it');
  r := cron_run('challenge-ending', '2026-11-19 19:00+00');
  return next is((select count(*) from notifications where user_id in (ce_ka, ce_ny) and kind = 'challenge_ending'), 2::bigint, 'the next hourly run queues nothing new');

  -- ---------------------------------------------------------------- week rollover, Monday 00:00 IST
  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at) values
    (r1, 900, 900, 'admin', '2026-11-17', '2026-11-17 10:00+05:30'),
    (r2, 800, 800, 'admin', '2026-11-18', '2026-11-18 10:00+05:30');
  insert into badges (slug, name, description, family, rule, coins, evaluated_on) values
    ('t-podium', 'Podium', 'Finish a week in the top 3', 'community', '{"metric":"weekly_rank_lte","scope":"global","lte":3}', 30, 'weekly');
  insert into challenges (type, title, goal, window_start, window_end, reward_xp, reward_coins) values
    ('weekly', 'Five a week', '{"metric":"sessions_total","gte":5}', '2026-11-15 18:30+00', '2026-11-22 18:30+00', 150, 40);
  r := cron_run('leaderboard-refresh', '2026-11-22 12:00+00');
  return next is((select rank from leaderboard_weekly where week_start = '2026-11-16' and scope = 'global' and user_id = r1), 1, 'the 5-minute refresh ranks the week');
  r := cron_run('week-rollover', '2026-11-22 18:30+00');
  return next is(r->>'finalised_week', '2026-11-16', 'rollover finalises last week');
  return next ok((select bool_and(final) from leaderboard_weekly where week_start = '2026-11-16'), 'and freezes its ranks');
  return next ok(exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = r1 and b.slug = 't-podium'), 'awards the weekly badge');
  return next is((select title from challenges where type = 'weekly' and window_start = '2026-11-22 18:30+00'), 'Five a week', 'and opens the new week''s challenge');
  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at) values
    (r2, 500, 500, 'admin', '2026-11-22', '2026-11-22 23:00+05:30');   -- a late row stamped in the old week
  r := cron_run('leaderboard-refresh', '2026-11-23 06:00+00');
  return next is((select xp from leaderboard_weekly where week_start = '2026-11-16' and scope = 'global' and user_id = r2), 800, 'a finalised week never changes');
  r := cron_run('rank-day-snapshot', '2026-11-23 18:30+00');
  return next is(r, '0'::jsonb, 'the day snapshot runs (no XP yet this week)');
  r := cron_run('entitlement-expiry', '2026-11-23 19:00+00');
  return next ok(jsonb_typeof(r) = 'number', 'the hourly expiry runs');
end $$;

create function pg_temp.dispatch() returns setof text language plpgsql as $$
declare
  q uuid := pg_temp.fx_user('Dispatch');
  q2 uuid := pg_temp.fx_user('Dispatch cap');
  t timestamptz := now() + interval '1 minute';
  n1 uuid; n2 uuid; n3 uuid; n4 uuid; n5 uuid; claimed jsonb; again jsonb;
  ids uuid[];
begin
  -- This test owns the queue: anything already queued (seed, live pg_cron) is parked; rolled back.
  update notifications set status = 'skipped', last_error = 'parked by test' where status = 'queued';
  insert into push_tokens (user_id, token, platform) values (q, 'https://push.example/web-' || q, 'web');
  insert into notifications (user_id, kind, dedupe_key, local_date, data) values (q, 'daily_reminder', 'd1-' || q, '2026-11-30', '{}') returning id into n1;
  insert into notifications (user_id, kind, dedupe_key, local_date, data) values (q, 'streak_at_risk', 'd2-' || q, '2026-11-30', '{"streak":5}') returning id into n2;

  claimed := claim_notifications(50, interval '2 minutes', t);
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(claimed) x where (x->>'user_id')::uuid = q;
  return next is(cardinality(ids), 2, 'a run claims both due rows');
  return next is((select x->'targets'->0->>'platform' from jsonb_array_elements(claimed) x where (x->>'id')::uuid = n1), 'web', 'with the athlete''s web push subscription as the target');
  again := claim_notifications(50, interval '2 minutes', t + interval '30 seconds');
  return next ok(not exists (select 1 from jsonb_array_elements(again) x where (x->>'user_id')::uuid = q), 'an overlapping run inside the lease gets neither row');

  return next ok(finish_notification(n1, 'sent', null, t + interval '1 second'), 'the holder marks one sent');
  return next is((select status from notifications where id = n1), 'sent', 'and it is sent');
  return next ok(finish_notification(n2, 'retry', 'http_503', t + interval '1 second'), 'a transient failure is retried');
  return next is((select send_after from notifications where id = n2), t + interval '1 second' + interval '1 minute', 'after a minute (first backoff)');
  again := claim_notifications(50, interval '2 minutes', t + interval '30 seconds');
  return next ok(not exists (select 1 from jsonb_array_elements(again) x where (x->>'id')::uuid = n2), 'not before its backoff');
  again := claim_notifications(50, interval '2 minutes', t + interval '2 minutes');
  return next is((select (x->>'attempts')::integer from jsonb_array_elements(again) x where (x->>'id')::uuid = n2), 2, 'then claimed again, attempt 2');
  return next ok(not finish_notification(n2, 'sent', null, t + interval '10 minutes'), 'a finish after the lease ran out is refused (another run may hold it)');

  update profiles set notify_challenge = false where id = q;
  insert into notifications (user_id, kind, dedupe_key, local_date) values (q, 'challenge_ending', 'd3-' || q, '2026-11-30') returning id into n3;
  again := claim_notifications(50, interval '2 minutes', t + interval '20 minutes');
  return next is((select status || ':' || last_error from notifications where id = n3), 'skipped:toggle_off', 'a kind switched off in Profile is skipped and recorded at send time');

  insert into notifications (user_id, kind, dedupe_key, local_date, status, sent_at) values
    (q2, 'daily_reminder', 'e1-' || q2, '2026-11-30', 'sent', t), (q2, 'streak_at_risk', 'e2-' || q2, '2026-11-30', 'sent', t);
  insert into notifications (user_id, kind, dedupe_key, local_date) values (q2, 'challenge_ending', 'e3-' || q2, '2026-11-30') returning id into n4;
  again := claim_notifications(50, interval '2 minutes', t + interval '21 minutes');
  return next is((select status || ':' || last_error from notifications where id = n4), 'skipped:daily_cap', 'two already sent that day: a third is skipped at send time');

  insert into notifications (user_id, kind, dedupe_key, local_date, attempts) values (q, 'daily_reminder', 'd5-' || q, '2026-12-01', 4) returning id into n5;
  again := claim_notifications(50, interval '2 minutes', t + interval '22 minutes');
  perform finish_notification(n5, 'retry', 'http_500', t + interval '22 minutes');
  return next is((select status || ':' || attempts from notifications where id = n5), 'failed:5', 'the fifth failed attempt fails the row');
  return next throws_ok(format('select finish_notification(%L, %L, null, %L)', n2, 'nonsense', t + interval '2 minutes 1 second'), '22023', null, 'an unknown outcome is refused');
end $$;

create function pg_temp.feed_and_unlock() returns setof text language plpgsql as $$
declare
  a uuid := pg_temp.fx_user('Feed A'); b uuid := pg_temp.fx_user('Feed B');
  paid uuid := pg_temp.fx_program(1, false, 2); free uuid := pg_temp.fx_program(1, true, 1);
  na uuid; nb uuid; locked jsonb; d uuid; item uuid; n integer;
begin
  insert into notifications (user_id, kind, dedupe_key, local_date, status) values (a, 'daily_reminder', 'f1-' || a, '2026-11-30', 'sent') returning id into na;
  insert into notifications (user_id, kind, dedupe_key, local_date, status) values (b, 'daily_reminder', 'f1-' || b, '2026-11-30', 'sent') returning id into nb;
  set local role eyeq_api;
  perform set_config('app.user_id', a::text, true);
  update notifications set read_at = now() where id in (na, nb);
  get diagnostics n = row_count;
  return next is(n, 1, 'the athlete can mark only their own notification read');
  return next throws_ok(format('update notifications set data = %L where id = %L', '{}', na), '42501', null, 'and cannot change anything else on it');

  locked := my_unlockable_drills();
  return next ok(exists (select 1 from jsonb_array_elements(locked) x join session_drills sd on sd.drill_id = (x->>'id')::uuid join sessions s on s.id = sd.session_id where s.program_id = paid),
    'a drill of a paid program is offered for a coin unlock');
  return next ok(not exists (select 1 from jsonb_array_elements(locked) x join session_drills sd on sd.drill_id = (x->>'id')::uuid join sessions s on s.id = sd.session_id where s.program_id = free),
    'a drill the athlete can already open is not');
  return next ok(locked::text !~ 'ref-', 'no video reference leaves the server (rule 5)');
  perform set_config('app.user_id', '', true);
  set local role eyeq_owner;

  perform earn_coins(a, 100, 'admin');
  select (x->>'id')::uuid into d from jsonb_array_elements(unlockable_drills_for(a)) x
    join session_drills sd on sd.drill_id = (x->>'id')::uuid join sessions s on s.id = sd.session_id where s.program_id = paid limit 1;
  select id into item from reward_items where kind = 'drill_unlock' and active limit 1;
  if item is null then
    insert into reward_items (slug, kind, title, coin_price) values ('t-unlock', 'drill_unlock', 'Unlock a drill', 30) returning id into item;
  end if;
  perform purchase_reward_for(a, item, d);
  return next ok(not exists (select 1 from jsonb_array_elements(unlockable_drills_for(a)) x where (x->>'id')::uuid = d), 'once unlocked it is no longer offered');
end $$;

select pg_temp.t();
select pg_temp.dispatch();
select pg_temp.feed_and_unlock();
select * from finish();
