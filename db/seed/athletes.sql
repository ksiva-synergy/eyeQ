-- The demo athletes (24, Arjun R. is n = 1) and their activity, all dated relative to now():
-- Arjun's run ends yesterday, eleven athletes trained today, this week's XP is this week's.
-- Run after seed.sql's content. pg_temp.uid(n) names athlete n (and his enrolment, 901):
-- the seed defines it as sid(1, n); `pnpm demo:refresh` defines fresh ids, so the cohort
-- can be laid down again without touching an existing ledger row (rule 2).
-- Expects role eyeq_owner, and pg_temp.sid() from seed.sql or the refresh runner.

-- ---------------------------------------------------------------- athletes (about 25, 18 cricketers)
-- Arjun R. is uid(1). Levels on the boards are reproduced through total XP.
-- Each athlete is an auth user first (profiles.id references auth.users, migration 0014);
-- demo users have no phone or email, so nobody can sign in as them.
-- The runner sets role eyeq_owner; auth.users belongs to the admin role, so step out for it.
reset role;
insert into auth.users (id) select pg_temp.uid(n) from generate_series(1, 24) n on conflict do nothing;
set role eyeq_owner;
insert into profiles (id, display_name, sport, playing_level, dob, goal, timezone, visibility, onboarded_at, created_at) values
  (pg_temp.uid(1), 'Arjun R.', 'cricket', 'district', '2004-03-14', 'Pick up the ball earlier', 'Asia/Kolkata', 'public', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.uid(2), 'Rohan S.', 'cricket', 'state', '2001-06-02', null, 'Asia/Kolkata', 'public', now() - interval '120 days', now() - interval '120 days'),
  (pg_temp.uid(3), 'Ishaan V.', 'cricket', 'district', '2003-01-20', null, 'Asia/Kolkata', 'public', now() - interval '100 days', now() - interval '100 days'),
  (pg_temp.uid(4), 'Meera D.', 'cricket', 'club', '2005-09-09', null, 'Asia/Kolkata', 'public', now() - interval '90 days', now() - interval '90 days'),
  (pg_temp.uid(5), 'Priya M.', 'cricket', 'club', '2002-11-30', null, 'Asia/Kolkata', 'public', now() - interval '80 days', now() - interval '80 days'),
  (pg_temp.uid(6), 'Kabir N.', 'cricket', 'district', '2000-04-18', null, 'Asia/Kolkata', 'public', now() - interval '85 days', now() - interval '85 days'),
  (pg_temp.uid(7), 'Aditya K.', 'cricket', 'school', '2010-02-11', null, 'Asia/Kolkata', 'public', now() - interval '60 days', now() - interval '60 days'),
  (pg_temp.uid(8), 'Sneha K.', 'cricket', 'club', '2003-07-07', null, 'Asia/Kolkata', 'public', now() - interval '70 days', now() - interval '70 days'),
  (pg_temp.uid(9), 'Vikram P.', 'cricket', 'school', '2011-12-01', null, 'Asia/Kolkata', 'public', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.uid(10), 'Tanvi R.', 'cricket', 'club', '2004-05-25', null, 'Asia/Kolkata', 'public', now() - interval '50 days', now() - interval '50 days'),
  (pg_temp.uid(11), 'Yash B.', 'cricket', 'club', '2003-03-03', null, 'Asia/Kolkata', 'public', now() - interval '45 days', now() - interval '45 days'),
  (pg_temp.uid(12), 'Diya S.', 'cricket', 'school', '2009-08-19', null, 'Asia/Kolkata', 'public', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.uid(13), 'Harsh T.', 'cricket', 'district', '2002-02-02', null, 'Asia/Kolkata', 'public', now() - interval '35 days', now() - interval '35 days'),
  (pg_temp.uid(14), 'Nisha L.', 'cricket', 'club', '2004-10-10', null, 'Asia/Kolkata', 'public', now() - interval '33 days', now() - interval '33 days'),
  (pg_temp.uid(15), 'Karan J.', 'cricket', 'state', '1999-12-12', null, 'Asia/Kolkata', 'public', now() - interval '28 days', now() - interval '28 days'),
  (pg_temp.uid(16), 'Aarav G.', 'cricket', 'school', '2010-06-30', null, 'Asia/Kolkata', 'public', now() - interval '25 days', now() - interval '25 days'),
  (pg_temp.uid(17), 'Riya C.', 'cricket', 'club', '2003-04-04', null, 'Asia/Kolkata', 'public', now() - interval '22 days', now() - interval '22 days'),
  (pg_temp.uid(18), 'Sahil W.', 'cricket', 'district', '2001-01-01', null, 'Asia/Kolkata', 'public', now() - interval '20 days', now() - interval '20 days'),
  (pg_temp.uid(19), 'Ananya B.', 'badminton', 'state', '2000-08-08', null, 'Asia/Kolkata', 'public', now() - interval '150 days', now() - interval '150 days'),
  (pg_temp.uid(20), 'Nikhil T.', 'badminton', 'district', '2002-09-17', null, 'Asia/Kolkata', 'public', now() - interval '90 days', now() - interval '90 days'),
  (pg_temp.uid(21), 'Dev M.', 'tennis', 'state', '2001-03-21', null, 'Asia/Kolkata', 'public', now() - interval '110 days', now() - interval '110 days'),
  (pg_temp.uid(22), 'Zara F.', 'football', 'district', '2003-12-05', null, 'Asia/Kolkata', 'public', now() - interval '95 days', now() - interval '95 days'),
  (pg_temp.uid(23), 'Omar H.', 'football', 'club', '2004-07-14', null, 'Asia/Kolkata', 'private', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.uid(24), 'Lena P.', 'tennis', 'club', '2005-02-28', null, 'Asia/Kolkata', 'public', now() - interval '30 days', now() - interval '30 days');

-- XP history: total XP (level) and this week's XP, as 'admin' rows (seed note).
-- (n, total, this_week)
with figures (n, total, week) as (values
  (2, 4320, 612), (3, 3360, 588), (4, 2740, 540), (5, 1980, 388), (6, 2290, 365), (7, 1200, 340), (8, 1500, 318),
  (9, 820, 290), (10, 1150, 276), (11, 900, 210), (12, 700, 180), (13, 1300, 160), (14, 640, 140), (15, 1900, 120), (16, 380, 95),
  (17, 560, 60), (18, 300, 40), (19, 4810, 604), (20, 2515, 455), (21, 3905, 571), (22, 3210, 498), (23, 760, 230), (24, 420, 80)),
week as (select local_day_start(ist_week_start(now()), 'Asia/Kolkata') as t0),
-- This week's XP lands between Monday 00:00 IST and now, whatever the weekday: on a Monday
-- morning it is still this week's, and never stamped in the future.
placed as (select f.*, week.t0 + (now() - week.t0) * (f.n / 30.0) as at from figures f, week)
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
select pg_temp.uid(f.n), f.total - f.week, f.total - f.week, 'admin', (now() - interval '30 days')::date, now() - interval '30 days' from figures f where f.total - f.week > 0
union all
select pg_temp.uid(p.n), p.week, p.week, 'admin', local_date(p.at, 'Asia/Kolkata'), p.at from placed p where p.week > 0;

-- Arjun: enrolled in Cricket Vision Foundations, 12 days done (days 1-12 on the last 12 days), an
-- earlier 19-day run, 1 freeze held, 140 coins, six badges, a baseline rating, Pro subscription.
insert into enrollments (id, user_id, program_id, started_at, start_local_date, current_day, last_completed_local_date, last_completed_session_id, is_active)
values (pg_temp.uid(901), pg_temp.uid(1), pg_temp.sid(3, 2), now() - interval '12 days', (local_date(now(), 'Asia/Kolkata') - 12), 13,
        local_date(now(), 'Asia/Kolkata') - 1, pg_temp.sid(5, 212), true);
insert into session_completions (user_id, session_id, local_date, completed_at)
select pg_temp.uid(1), pg_temp.sid(5, 200 + d), local_date(now(), 'Asia/Kolkata') - 13 + d, local_day_start(local_date(now(), 'Asia/Kolkata') - 13 + d, 'Asia/Kolkata') + interval '19 hours'
from generate_series(1, 12) d;
-- drill completions behind those sessions (so Saccade Ladder has been done 9 times: Scan Master I unlocks on the next one)
insert into drill_completions (user_id, drill_id, session_id, completed_at, received_at, local_date, watch_pct, client_event_id)
select pg_temp.uid(1), sd.drill_id, sd.session_id, sc.completed_at - interval '10 minutes' + make_interval(mins => sd."order" * 3), sc.completed_at, sc.local_date, 1,
       'seed-' || sd.session_id || '-' || sd.drill_id
from session_completions sc join session_drills sd on sd.session_id = sc.session_id where sc.user_id = pg_temp.uid(1);
insert into drill_completions (user_id, drill_id, session_id, completed_at, received_at, local_date, watch_pct, client_event_id)
select pg_temp.uid(1), pg_temp.sid(6, 3), null, local_day_start(local_date(now(), 'Asia/Kolkata') - 40 + d, 'Asia/Kolkata') + interval '7 hours', local_day_start(local_date(now(), 'Asia/Kolkata') - 40 + d, 'Asia/Kolkata') + interval '7 hours', local_date(now(), 'Asia/Kolkata') - 40 + d, 1, 'seed-saccade-' || d
from generate_series(1, 9 - (select count(*) from drill_completions where user_id = pg_temp.uid(1) and drill_id = pg_temp.sid(6, 3))::integer) d;
-- earlier 19-day run ending 20 days ago, on the free Reset program and free drills (free_drill_id)
insert into session_completions (user_id, free_drill_id, local_date, completed_at)
select pg_temp.uid(1), pg_temp.sid(6, 7), local_date(now(), 'Asia/Kolkata') - 38 + d, local_day_start(local_date(now(), 'Asia/Kolkata') - 38 + d, 'Asia/Kolkata') + interval '7 hours'
from generate_series(0, 18) d;
insert into freeze_ledger (user_id, amount, reason, created_at) values (pg_temp.uid(1), 1, 'sub_grant', now() - interval '3 days');
insert into coin_ledger (user_id, amount, reason, created_at) values (pg_temp.uid(1), 100, 'admin', now() - interval '25 days');
insert into user_badges (user_id, badge_id, awarded_at) values
  (pg_temp.uid(1), pg_temp.sid(7, 1), now() - interval '38 days'), (pg_temp.uid(1), pg_temp.sid(7, 2), now() - interval '36 days'),
  (pg_temp.uid(1), pg_temp.sid(7, 3), now() - interval '32 days'), (pg_temp.uid(1), pg_temp.sid(7, 4), now() - interval '25 days'),
  (pg_temp.uid(1), pg_temp.sid(7, 10), now() - interval '26 days'), (pg_temp.uid(1), pg_temp.sid(7, 16), now() - interval '9 days'),
  (pg_temp.uid(1), pg_temp.sid(7, 13), now() - interval '6 days');
insert into self_ratings (user_id, area, rating, kind, taken_at) values
  (pg_temp.uid(1), 'focus', 2, 'baseline', now() - interval '40 days'), (pg_temp.uid(1), 'reaction', 3, 'baseline', now() - interval '40 days'),
  (pg_temp.uid(1), 'tracking', 2, 'baseline', now() - interval '40 days');
select grant_entitlement(pg_temp.uid(1), 'subscription', null, 'admin', now() - interval '40 days', now() + interval '20 days', 'seed', null, pg_temp.sid(1, 25), 'seed');
-- a few other subscribers and program owners
select grant_entitlement(pg_temp.uid(n), 'subscription', null, 'admin', now() - interval '30 days', now() + interval '30 days', 'seed', null, pg_temp.sid(1, 25), 'seed') from generate_series(2, 6) n;
select grant_entitlement(pg_temp.uid(7), 'program', pg_temp.sid(3, 2), 'admin', now() - interval '30 days', null, 'seed', null, pg_temp.sid(1, 25), 'seed');
-- today's trainers (board: "11 of 20 trained today") and enrolments for the rest of the cricketers
insert into enrollments (user_id, program_id, started_at, start_local_date, current_day, is_active)
select pg_temp.uid(n), pg_temp.sid(3, 2), now() - interval '10 days', local_date(now(), 'Asia/Kolkata') - 10, 1, true from generate_series(2, 7) n;
insert into session_completions (user_id, free_drill_id, local_date, completed_at)
select pg_temp.uid(n), free_drill_of_day(local_date(now(), 'Asia/Kolkata')), local_date(now(), 'Asia/Kolkata'),
       greatest(now() - interval '1 hour', local_day_start(local_date(now(), 'Asia/Kolkata'), 'Asia/Kolkata'))  -- today, even just after midnight
from generate_series(8, 18) n;

-- progress rows so the cards can say how many joined. A challenge that is already met pays
-- its reward here; Arjun's totals are then normalised to the prototype's 2,040 XP and 140 coins.
select update_challenge_progress(pg_temp.uid(n)) from generate_series(1, 24) n;
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
values (pg_temp.uid(1), 2040 - 412, 2040 - 412, 'admin', (now() - interval '30 days')::date, now() - interval '30 days');
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
select pg_temp.uid(1), 412 - w.earned, 412 - w.earned, 'admin', local_date(t.at, 'Asia/Kolkata'), t.at
from (select coalesce(sum(amount), 0)::integer as earned from xp_ledger where user_id = pg_temp.uid(1) and created_at >= local_day_start(ist_week_start(now()), 'Asia/Kolkata')) w,
     (select local_day_start(ist_week_start(now()), 'Asia/Kolkata') + (now() - local_day_start(ist_week_start(now()), 'Asia/Kolkata')) / 60 as at) t
where 412 - w.earned > 0;
insert into coin_ledger (user_id, amount, reason, created_at)
select pg_temp.uid(1), 140 - coin_balance(pg_temp.uid(1)), 'admin', now() - interval '20 days' where coin_balance(pg_temp.uid(1)) <> 140;

-- ---------------------------------------------------------------- caches
select rebuild_all_user_stats();
select rebuild_leaderboards();
