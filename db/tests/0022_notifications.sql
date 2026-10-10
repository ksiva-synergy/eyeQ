-- Enqueue: at-risk at 8 pm local in two timezones, not for an athlete who trained; 2-a-day cap; challenge ending (plan 6.9)
select plan(9);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(10); a uuid := pg_temp.fx_user('ist', 'Asia/Kolkata'); b uuid := pg_temp.fx_user('ny', 'America/New_York'); c uuid := pg_temp.fx_user('done', 'Asia/Kolkata');
        t_ist timestamptz := '2026-10-09 14:35+00';   -- 20:05 IST, 10:35 New York
        t_ny timestamptz := '2026-10-10 00:05+00';    -- 20:05 New York
        r jsonb;
begin
  perform pg_temp.fx_streak(a, p, 4, '2026-10-08');
  perform pg_temp.fx_streak(b, p, 4, '2026-10-08', 'America/New_York');
  perform pg_temp.fx_streak(c, p, 5, '2026-10-09');
  r := enqueue_notifications(t_ist);
  return next is((select count(*) from notifications where user_id in (a, b, c) and kind = 'streak_at_risk'), 1::bigint, 'one at-risk notice at 20:05 IST');
  return next ok(exists (select 1 from notifications where user_id = a and kind = 'streak_at_risk' and status = 'queued'), 'for the IST athlete');
  return next ok(not exists (select 1 from notifications where user_id = b), 'not yet for New York (10:35 there)');
  return next ok(not exists (select 1 from notifications where user_id = c), 'not for the athlete who trained today');
  r := enqueue_notifications(t_ist);
  return next is((select count(*) from notifications where user_id in (a, b, c) and kind = 'streak_at_risk'), 1::bigint, 'running again queues nothing new (dedupe)');
  r := enqueue_notifications(t_ny);
  return next ok(exists (select 1 from notifications where user_id = b and kind = 'streak_at_risk' and status = 'queued'), 'New York gets it at its own 20:05');
  perform enqueue_notification(a, 'daily_reminder', '2026-10-09', 'x1', '{}');
  return next is((select status from notifications where dedupe_key = 'x1'), 'queued', 'second push of the day is queued');
  perform enqueue_notification(a, 'challenge_ending', '2026-10-09', 'x2', '{}');
  return next is((select status || ':' || last_error from notifications where dedupe_key = 'x2'), 'skipped:daily_cap', 'third push of the day is skipped and recorded');
  insert into challenges (id, type, title, goal, window_start, window_end, reward_xp) values
    ('00000000-0000-4000-a000-00000000ce01', 'weekly', 'x', '{"metric":"sessions_total","gte":99}', t_ny - interval '6 days', t_ny + interval '23 hours', 10);
  insert into challenge_progress (challenge_id, user_id, progress, target) values ('00000000-0000-4000-a000-00000000ce01', b, 1, 99);
  r := enqueue_notifications(t_ny);
  return next ok(exists (select 1 from notifications where user_id = b and kind = 'challenge_ending' and status in ('queued', 'skipped')), 'a challenge-ending notice is recorded 23 h before the window closes');
end $$;
select pg_temp.t();
select * from finish();
