-- Local dates from the athlete's timezone; 48-hour late-sync rule (plan 6.4)
select plan(10);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(4); a uuid := pg_temp.fx_user('ist', 'Asia/Kolkata'); b uuid := pg_temp.fx_user('ny', 'America/New_York');
        c uuid := pg_temp.fx_user('late47'); d uuid := pg_temp.fx_user('late49'); rc jsonb; rd jsonb;
begin
  -- The same two instants: 2026-10-01 23:30 IST and 2026-10-02 00:30 IST.
  perform pg_temp.fx_complete_session(a, pg_temp.fx_session(p, 1), '2026-10-01 23:30+05:30', '2026-10-01 23:40+05:30');
  perform pg_temp.fx_complete_session(a, pg_temp.fx_session(p, 2), '2026-10-02 00:30+05:30', '2026-10-02 00:40+05:30');
  return next is((select array_agg(local_date order by local_date) from session_completions where user_id = a), array['2026-10-01', '2026-10-02']::date[], 'IST: two local days across midnight');
  return next is(streak_run(a, '2026-10-02'), 2, 'IST: streak 2');
  -- For New York those instants are 14:00 and 15:00 on 2026-10-01: one local day.
  perform pg_temp.fx_complete_session(b, pg_temp.fx_session(p, 1), '2026-10-01 23:30+05:30', '2026-10-01 23:40+05:30');
  perform pg_temp.fx_complete_session(b, pg_temp.fx_session(p, 2), '2026-10-02 00:30+05:30', '2026-10-02 00:40+05:30');
  return next is((select array_agg(local_date order by local_date) from session_completions where user_id = b), array['2026-10-01']::date[], 'New York: the same instants are one local day');
  return next is(streak_run(b, '2026-10-01'), 1, 'New York: streak 1');
  return next is((select count(*) from xp_ledger where user_id = b and reason = 'session_bonus'), 1::bigint, 'New York: the second session that day earns no second bonus');
  -- Late sync: 47 hours late still counts for the streak; 49 hours late earns XP but no streak credit.
  rc := pg_temp.fx_complete_session(c, pg_temp.fx_session(p, 1), '2026-10-05 19:00+05:30', '2026-10-05 19:00+05:30'::timestamptz + interval '47 hours');
  rd := pg_temp.fx_complete_session(d, pg_temp.fx_session(p, 1), '2026-10-05 19:00+05:30', '2026-10-05 19:00+05:30'::timestamptz + interval '49 hours');
  return next is((select counts_for_streak from session_completions where user_id = c), true, '47 h late: counts for the streak');
  return next is((select counts_for_streak from session_completions where user_id = d), false, '49 h late: stored, no streak credit');
  return next is(streak_run(c, '2026-10-05'), 1, '47 h late: streak credited for the day it was done');
  return next is(streak_run(d, '2026-10-05'), 0, '49 h late: no streak');
  return next is(rd->>'xp_earned', rc->>'xp_earned', '49 h late: XP as normal');
end $$;
select pg_temp.t();
select * from finish();
