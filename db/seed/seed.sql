-- Demo content and athletes reproducing the prototype (plan phase 1).
-- Fixed ids under the 0000000N prefix. Not re-runnable (ledgers are append-only): reset first.
-- Run through `pnpm db:seed` (sets role eyeq_owner, seeds game_config first).

create or replace function pg_temp.sid(kind integer, n integer) returns uuid
language sql immutable as $$ select (lpad(kind::text, 8, '0') || '-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid $$;
-- kinds: 1 users, 2 products, 3 programs, 4 modules, 5 sessions, 6 drills, 7 badges, 8 challenges, 9 reward items

-- Ledgers are append-only, so demo data cannot be wiped in place: reset first.
do $$ begin
  if exists (select 1 from profiles where id = pg_temp.sid(1, 1)) then
    raise exception 'demo data is already seeded; run pnpm db:reset && pnpm db:seed';
  end if;
end $$;

-- ---------------------------------------------------------------- measurement tags (12, three groups)
insert into measurement_tags (slug, name, "group", sort) values
  ('dynamic-visual-acuity', 'Dynamic Visual Acuity', 'vision', 1),
  ('contrast-sensitivity', 'Contrast Sensitivity', 'vision', 2),
  ('binocular-acuity', 'Binocular Visual Acuity', 'vision', 3),
  ('colour-perception', 'Colour Perception', 'vision', 4),
  ('stereopsis', 'Stereopsis', 'vision', 5),
  ('simple-reaction-speed', 'Simple Reaction Speed', 'reaction', 6),
  ('complex-reaction-speed', 'Complex Reaction Speed', 'reaction', 7),
  ('hand-eye-coordination', 'Hand-Eye Coordination', 'reaction', 8),
  ('anticipation', 'Anticipation', 'reaction', 9),
  ('executive-scan', 'Executive Scan', 'cognition', 10),
  ('digit-span', 'Digit Span', 'cognition', 11),
  ('short-term-visual-memory', 'Short-Term Visual Memory', 'cognition', 12)
on conflict (slug) do update set name = excluded.name, "group" = excluded."group", sort = excluded.sort;

-- ---------------------------------------------------------------- products (D21: placeholder prices)
insert into products (id, kind, title, price_paise, grants, play_product_id, appstore_product_id, razorpay_plan_id, razorpay_item_id) values
  (pg_temp.sid(2, 1), 'subscription', 'EyeQ Pro · monthly', 29900, '{"scope":"subscription","duration_days":30}', 'eyeq_pro_monthly', 'eyeq_pro_monthly', null, null),
  (pg_temp.sid(2, 2), 'subscription', 'EyeQ Pro · quarterly', 79900, '{"scope":"subscription","duration_days":90}', 'eyeq_pro_quarterly', 'eyeq_pro_quarterly', null, null),
  (pg_temp.sid(2, 3), 'subscription', 'EyeQ Pro · annual', 249900, '{"scope":"subscription","duration_days":365}', 'eyeq_pro_annual', 'eyeq_pro_annual', null, null),
  (pg_temp.sid(2, 11), 'program', 'Cricket Vision Foundations', 99900, jsonb_build_object('scope', 'program', 'scope_id', pg_temp.sid(3, 2)), 'eyeq_program_cvf', 'eyeq_program_cvf', null, null),
  (pg_temp.sid(2, 12), 'program', 'Reaction Edge', 129900, jsonb_build_object('scope', 'program', 'scope_id', pg_temp.sid(3, 3)), 'eyeq_program_reaction_edge', 'eyeq_program_reaction_edge', null, null),
  (pg_temp.sid(2, 13), 'program', 'Focus Under Pressure', 79900, jsonb_build_object('scope', 'program', 'scope_id', pg_temp.sid(3, 4)), 'eyeq_program_fup', 'eyeq_program_fup', null, null),
  (pg_temp.sid(2, 21), 'credit_pack', '10 credits', 49900, '{"scope":"credits","credits":10}', 'eyeq_credits_10', 'eyeq_credits_10', null, null),
  (pg_temp.sid(2, 31), 'drill', 'Single drill · pay per view', 9900, '{"scope":"drill"}', 'eyeq_drill_ppv', 'eyeq_drill_ppv', null, null);

-- ---------------------------------------------------------------- drills (video refs are placeholders)
insert into drills (id, title, video_provider, video_ref, instructions, target_type, target_value, target_label, rest_seconds, duration_minutes,
                    score_type, score_direction, score_unit, measurement_tag, access, coin_price) values
  (pg_temp.sid(6, 1), 'Near–Far Focus Shifts', 'youtube', 'dQw4w9WgXcQ',
    array['Hold the near card at arm''s length; pick a far target 5 m away.', 'On each beep, snap focus between them. Both eyes open.', 'Count how many clean shifts you make in 30 s.'],
    'seconds', 30, '3 sets × 30 s', 15, 4, 'number', 'higher', 'clean shifts', 'dynamic-visual-acuity', 'free_preview', null),
  (pg_temp.sid(6, 2), 'Peripheral Flash Catch', 'youtube', 'dQw4w9WgXcQ',
    array['Fix your eyes on the centre mark.', 'Tap the side a flash appears on without moving your eyes.', 'Three sets of 20 flashes.'],
    'reps', 20, '3 sets × 20', 15, 3, 'number', 'higher', 'catches', 'simple-reaction-speed', 'included', null),
  (pg_temp.sid(6, 3), 'Saccade Ladder', 'youtube', 'dQw4w9WgXcQ',
    array['Place the two charts 1 m apart at eye height.', 'Read the letters alternating left and right, top to bottom.', 'Two ladders, as fast as you can read accurately.'],
    'reps', 2, '2 ladders', 20, 4, 'rating', 'higher', null, 'executive-scan', 'included', null),
  (pg_temp.sid(6, 4), 'Number Recall Sprint', 'youtube', 'dQw4w9WgXcQ',
    array['Watch the digits flash for one second.', 'Say them back in order.', 'Ten rounds; the span grows when you get three in a row.'],
    'reps', 10, '10 rounds', 10, 3, 'number', 'higher', 'digits', 'digit-span', 'included', null),
  (pg_temp.sid(6, 5), 'Light Tap', 'youtube', 'dQw4w9WgXcQ', array['Stand square to the wall grid.', 'Tap each light as it appears.', 'Three rounds of 30 s.'],
    'seconds', 30, '3 × 30 s', 15, 3, 'number', 'higher', 'taps', 'hand-eye-coordination', 'included', null),
  (pg_temp.sid(6, 6), 'Flash Catch', 'youtube', 'dQw4w9WgXcQ', array['Partner drops the ball from shoulder height without warning.', 'Catch before the second bounce.', 'Twenty drops.'],
    'reps', 20, '20 drops', 10, 3, 'number', 'higher', 'catches', 'simple-reaction-speed', 'included', null),
  (pg_temp.sid(6, 7), 'Colour Call', 'youtube', 'dQw4w9WgXcQ', array['Call the colour, not the word.', 'Two passes of the card.'],
    'reps', 2, '2 passes', 10, 3, 'rating', 'higher', null, 'colour-perception', 'free_pool', null),
  (pg_temp.sid(6, 8), 'Brock String', 'youtube', 'dQw4w9WgXcQ', array['Hold the string to your nose.', 'Shift focus bead to bead on the beep.', 'Three minutes.'],
    'seconds', 180, '3 min', 0, 3, 'rating', 'higher', null, 'binocular-acuity', 'free_pool', null),
  (pg_temp.sid(6, 9), 'Contrast Steps', 'youtube', 'dQw4w9WgXcQ', array['Dim the room.', 'Read each contrast step down to the last you can.'],
    'none', null, null, 0, 3, 'number', 'higher', 'steps', 'contrast-sensitivity', 'free_pool', null),
  (pg_temp.sid(6, 10), 'Depth Toss', 'youtube', 'dQw4w9WgXcQ', array['Three cups at 2, 4 and 6 m.', 'Toss to the called cup.', 'Fifteen tosses.'],
    'reps', 15, '15 tosses', 10, 3, 'number', 'higher', 'hits', 'stereopsis', 'included', null),
  (pg_temp.sid(6, 11), 'Cue Read', 'youtube', 'dQw4w9WgXcQ', array['Watch the release only.', 'Call the line before the bounce.', 'Twenty balls.'],
    'reps', 20, '20 balls', 10, 4, 'number', 'higher', 'correct calls', 'anticipation', 'included', null),
  (pg_temp.sid(6, 12), 'Choice Tap', 'youtube', 'dQw4w9WgXcQ', array['Tap green, skip red.', 'Three rounds of 30 s.'],
    'seconds', 30, '3 × 30 s', 15, 3, 'number', 'lower', 'ms', 'complex-reaction-speed', 'included', null),
  (pg_temp.sid(6, 13), 'Pattern Hold', 'youtube', 'dQw4w9WgXcQ', array['Study the grid for two seconds.', 'Rebuild it from memory.', 'Ten grids.'],
    'reps', 10, '10 grids', 10, 3, 'number', 'higher', 'grids', 'short-term-visual-memory', 'included', null),
  (pg_temp.sid(6, 14), 'Pro Scan Sprint', 'drive', '1AbCdEfGhIjKlMnOpQrStUvWxYz', array['Scan the board corner to corner.', 'Call the odd mark.'],
    'reps', 10, '10 boards', 10, 4, 'number', 'higher', 'boards', 'executive-scan', 'ppv', 30);
update drills set ppv_product_id = pg_temp.sid(2, 31) where id = pg_temp.sid(6, 14);

-- ---------------------------------------------------------------- programs
insert into programs (id, slug, title, description, sport_tags, level, duration_days, is_free, in_subscription, product_id, completion_xp, coach_line, status) values
  (pg_temp.sid(3, 1), 'eye-health-reset', '3-Day Eye Health Reset', 'Three ten-minute sessions on the vision basics. Free for every athlete.', '{}', 'beginner', 3, true, true, null, 100, 'Coach Vevek · Forge Your Peak', 'published'),
  (pg_temp.sid(3, 2), 'cricket-vision-foundations', 'Cricket Vision Foundations', 'Twenty-one days on the vision and reaction measurements that decide the first half-second at the crease.', '{cricket}', 'intermediate', 21, false, true, pg_temp.sid(2, 11), 500, 'Coach Vevek · Forge Your Peak', 'published'),
  (pg_temp.sid(3, 3), 'reaction-edge', 'Reaction Edge', 'Four weeks on the three reaction measurements: simple reaction speed, complex reaction speed and anticipation. Built for the first half-second after release.', '{cricket,badminton,tennis}', 'intermediate', 28, false, true, pg_temp.sid(2, 12), 500, 'Coach Vevek · Forge Your Peak', 'published'),
  (pg_temp.sid(3, 4), 'focus-under-pressure', 'Focus Under Pressure', 'Two weeks on executive scan, digit span and decision-making when the clock is running.', '{cricket,badminton,tennis,football}', 'advanced', 14, false, true, pg_temp.sid(2, 13), 500, 'Coach Vevek · Forge Your Peak', 'published');

-- modules: id = sid(4, program*10 + order)
insert into modules (id, program_id, "order", title, unlock_rule, unlock_day) values
  (pg_temp.sid(4, 11), pg_temp.sid(3, 1), 1, 'Reset', 'immediate', null),
  (pg_temp.sid(4, 21), pg_temp.sid(3, 2), 1, 'See It Early', 'immediate', null),
  (pg_temp.sid(4, 22), pg_temp.sid(3, 2), 2, 'Track It Clean', 'after_previous', null),
  (pg_temp.sid(4, 23), pg_temp.sid(3, 2), 3, 'Decide Faster', 'after_previous', null),
  (pg_temp.sid(4, 31), pg_temp.sid(3, 3), 1, 'Simple Reaction Base', 'immediate', null),
  (pg_temp.sid(4, 32), pg_temp.sid(3, 3), 2, 'Choice Under Load', 'after_previous', null),
  (pg_temp.sid(4, 33), pg_temp.sid(3, 3), 3, 'Read the Cue', 'after_previous', null),
  (pg_temp.sid(4, 34), pg_temp.sid(3, 3), 4, 'Match Tempo', 'after_previous', null),
  (pg_temp.sid(4, 41), pg_temp.sid(3, 4), 1, 'Scan', 'immediate', null),
  (pg_temp.sid(4, 42), pg_temp.sid(3, 4), 2, 'Hold', 'on_day', 8);

-- sessions: id = sid(5, program*100 + day); one per day, module by day band
insert into sessions (id, program_id, module_id, day_number, title, est_minutes)
select pg_temp.sid(5, p.n * 100 + d), p.id, m.id, d, 'Day ' || d, 14
from (values (1, pg_temp.sid(3, 1), 3), (2, pg_temp.sid(3, 2), 21), (3, pg_temp.sid(3, 3), 28), (4, pg_temp.sid(3, 4), 14)) p (n, id, days)
cross join lateral generate_series(1, p.days) d
join modules m on m.program_id = p.id and m."order" = case p.n
  when 1 then 1
  when 2 then least(3, (d - 1) / 7 + 1)
  when 3 then least(4, (d - 1) / 7 + 1)
  else case when d <= 7 then 1 else 2 end end;
update sessions set est_minutes = 10 where program_id = pg_temp.sid(3, 1);

-- session drills: a rotating pick of four from the library; the sample session (CVF day 13) is exact
insert into session_drills (session_id, drill_id, "order")
select s.id, pg_temp.sid(6, ((s.day_number + k * 3) % 13) + 1), k + 1
from sessions s cross join generate_series(0, 3) k
where s.program_id in (pg_temp.sid(3, 1), pg_temp.sid(3, 2), pg_temp.sid(3, 3), pg_temp.sid(3, 4))
  and not (s.program_id = pg_temp.sid(3, 2) and s.day_number = 13)
  and not (s.program_id = pg_temp.sid(3, 1) and k = 3);
insert into session_drills (session_id, drill_id, "order") values
  (pg_temp.sid(5, 213), pg_temp.sid(6, 1), 1),
  (pg_temp.sid(5, 213), pg_temp.sid(6, 2), 2),
  (pg_temp.sid(5, 213), pg_temp.sid(6, 3), 3),
  (pg_temp.sid(5, 213), pg_temp.sid(6, 4), 4);

-- ---------------------------------------------------------------- badges (17, D2)
insert into badges (id, slug, name, description, family, rule, coins, icon, evaluated_on, sort) values
  (pg_temp.sid(7, 1), 'first-rep', 'First Rep', 'Finish your first session', 'consistency', '{"metric":"sessions_total","gte":1}', 10, 'check', 'completion', 1),
  (pg_temp.sid(7, 2), 'streak-3', 'Three Days In', 'Reach a 3-day streak', 'consistency', '{"metric":"current_streak","gte":3}', 10, 'flame', 'completion', 2),
  (pg_temp.sid(7, 3), 'week-one', 'Week One', 'Reach a 7-day streak', 'consistency', '{"metric":"current_streak","gte":7}', 20, 'flame', 'completion', 3),
  (pg_temp.sid(7, 4), 'two-week-flame', 'Two-Week Flame', 'Reach a 14-day streak', 'consistency', '{"metric":"current_streak","gte":14}', 30, 'flame', 'completion', 4),
  (pg_temp.sid(7, 5), 'three-week-flame', 'Three-Week Flame', 'Reach a 21-day streak', 'consistency', '{"metric":"current_streak","gte":21}', 40, 'flame', 'completion', 5),
  (pg_temp.sid(7, 6), 'streak-30', 'Thirty Strong', 'Reach a 30-day streak', 'consistency', '{"metric":"current_streak","gte":30}', 60, 'flame', 'completion', 6),
  (pg_temp.sid(7, 7), 'streak-60', 'Sixty Days', 'Reach a 60-day streak', 'consistency', '{"metric":"current_streak","gte":60}', 100, 'flame', 'completion', 7),
  (pg_temp.sid(7, 8), 'streak-100', 'Century', 'Reach a 100-day streak', 'consistency', '{"metric":"current_streak","gte":100}', 150, 'flame', 'completion', 8),
  (pg_temp.sid(7, 9), 'streak-365', 'Full Year', 'Reach a 365-day streak', 'consistency', '{"metric":"current_streak","gte":365}', 500, 'flame', 'completion', 9),
  (pg_temp.sid(7, 10), 'early-bird', 'Early Bird', 'Finish 5 sessions before 8 am', 'consistency', '{"metric":"sessions_before_hour","hour":8,"gte":5}', 20, 'sun', 'completion', 10),
  (pg_temp.sid(7, 11), 'scan-master-1', 'Scan Master I', 'Complete 10 Executive Scan drills', 'volume', '{"metric":"drills_with_tag","tag":"executive-scan","gte":10}', 25, 'scan', 'completion', 11),
  (pg_temp.sid(7, 12), 'scan-master-2', 'Scan Master II', 'Complete 25 Executive Scan drills', 'volume', '{"metric":"drills_with_tag","tag":"executive-scan","gte":25}', 50, 'scan', 'completion', 12),
  (pg_temp.sid(7, 13), 'module-clear', 'Module Clear', 'Finish a full module', 'volume', '{"metric":"module_completions","gte":1}', 20, 'star', 'completion', 13),
  (pg_temp.sid(7, 14), 'program-done', 'Program Done', 'Complete a full program', 'volume', '{"metric":"program_completions","gte":1}', 100, 'trophy', 'completion', 14),
  (pg_temp.sid(7, 15), 'sharp-eye', 'Sharp Eye', 'Score 25+ clean shifts on Near–Far Focus Shifts', 'mastery', jsonb_build_object('metric', 'score_gte', 'drill_id', pg_temp.sid(6, 1), 'gte', 25), 20, 'eye', 'completion', 15),
  (pg_temp.sid(7, 16), 'five-a-week', 'Five-a-Week', 'Win a weekly challenge', 'community', '{"metric":"weekly_challenge_wins","gte":1}', 20, 'trophy', 'completion', 16),
  (pg_temp.sid(7, 17), 'top-3', 'Top 3', 'Finish a week on the podium', 'community', '{"metric":"weekly_rank_lte","scope":"global","lte":3}', 30, 'trophy', 'weekly', 17);

-- ---------------------------------------------------------------- rewards catalogue (plan 6.5)
insert into reward_items (id, slug, kind, title, description, coin_price, per_user_limit, per_user_period, sort) values
  (pg_temp.sid(9, 1), 'streak-freeze', 'freeze', 'Streak freeze', 'Protects one missed day', 50, null, null, 1),
  (pg_temp.sid(9, 2), 'drill-unlock', 'drill_unlock', 'Unlock a single drill', 'Any locked drill, forever', 30, null, null, 2),
  (pg_temp.sid(9, 3), 'profile-frame', 'frame', 'Profile frames', 'Ember, Volt, Peak gold · shows on boards', 80, null, null, 3),
  (pg_temp.sid(9, 4), 'program-voucher', 'voucher', 'Program discount', 'Off any one-time program', 200, null, null, 4),
  (pg_temp.sid(9, 5), 'coach-call', 'real_world', '20-min call with the coach', 'Review your scores', 500, 1, 'month', 5),
  (pg_temp.sid(9, 6), 'training-tee', 'real_world', 'EyeQ training tee', 'Ships in 7–10 days', 800, 1, 'lifetime', 6);

-- ---------------------------------------------------------------- athletes (about 25, 18 cricketers)
-- Arjun R. is sid(1, 1). Levels on the boards are reproduced through total XP.
-- Each athlete is an auth user first (profiles.id references auth.users, migration 0014);
-- demo users have no phone or email, so nobody can sign in as them.
-- The runner sets role eyeq_owner; auth.users belongs to the admin role, so step out for it.
reset role;
insert into auth.users (id) select pg_temp.sid(1, n) from generate_series(1, 25) n on conflict do nothing;
set role eyeq_owner;
insert into profiles (id, display_name, sport, playing_level, dob, goal, timezone, visibility, onboarded_at, created_at) values
  (pg_temp.sid(1, 1), 'Arjun R.', 'cricket', 'district', '2004-03-14', 'Pick up the ball earlier', 'Asia/Kolkata', 'public', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.sid(1, 2), 'Rohan S.', 'cricket', 'state', '2001-06-02', null, 'Asia/Kolkata', 'public', now() - interval '120 days', now() - interval '120 days'),
  (pg_temp.sid(1, 3), 'Ishaan V.', 'cricket', 'district', '2003-01-20', null, 'Asia/Kolkata', 'public', now() - interval '100 days', now() - interval '100 days'),
  (pg_temp.sid(1, 4), 'Meera D.', 'cricket', 'club', '2005-09-09', null, 'Asia/Kolkata', 'public', now() - interval '90 days', now() - interval '90 days'),
  (pg_temp.sid(1, 5), 'Priya M.', 'cricket', 'club', '2002-11-30', null, 'Asia/Kolkata', 'public', now() - interval '80 days', now() - interval '80 days'),
  (pg_temp.sid(1, 6), 'Kabir N.', 'cricket', 'district', '2000-04-18', null, 'Asia/Kolkata', 'public', now() - interval '85 days', now() - interval '85 days'),
  (pg_temp.sid(1, 7), 'Aditya K.', 'cricket', 'school', '2010-02-11', null, 'Asia/Kolkata', 'public', now() - interval '60 days', now() - interval '60 days'),
  (pg_temp.sid(1, 8), 'Sneha K.', 'cricket', 'club', '2003-07-07', null, 'Asia/Kolkata', 'public', now() - interval '70 days', now() - interval '70 days'),
  (pg_temp.sid(1, 9), 'Vikram P.', 'cricket', 'school', '2011-12-01', null, 'Asia/Kolkata', 'public', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.sid(1, 10), 'Tanvi R.', 'cricket', 'club', '2004-05-25', null, 'Asia/Kolkata', 'public', now() - interval '50 days', now() - interval '50 days'),
  (pg_temp.sid(1, 11), 'Yash B.', 'cricket', 'club', '2003-03-03', null, 'Asia/Kolkata', 'public', now() - interval '45 days', now() - interval '45 days'),
  (pg_temp.sid(1, 12), 'Diya S.', 'cricket', 'school', '2009-08-19', null, 'Asia/Kolkata', 'public', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.sid(1, 13), 'Harsh T.', 'cricket', 'district', '2002-02-02', null, 'Asia/Kolkata', 'public', now() - interval '35 days', now() - interval '35 days'),
  (pg_temp.sid(1, 14), 'Nisha L.', 'cricket', 'club', '2004-10-10', null, 'Asia/Kolkata', 'public', now() - interval '33 days', now() - interval '33 days'),
  (pg_temp.sid(1, 15), 'Karan J.', 'cricket', 'state', '1999-12-12', null, 'Asia/Kolkata', 'public', now() - interval '28 days', now() - interval '28 days'),
  (pg_temp.sid(1, 16), 'Aarav G.', 'cricket', 'school', '2010-06-30', null, 'Asia/Kolkata', 'public', now() - interval '25 days', now() - interval '25 days'),
  (pg_temp.sid(1, 17), 'Riya C.', 'cricket', 'club', '2003-04-04', null, 'Asia/Kolkata', 'public', now() - interval '22 days', now() - interval '22 days'),
  (pg_temp.sid(1, 18), 'Sahil W.', 'cricket', 'district', '2001-01-01', null, 'Asia/Kolkata', 'public', now() - interval '20 days', now() - interval '20 days'),
  (pg_temp.sid(1, 19), 'Ananya B.', 'badminton', 'state', '2000-08-08', null, 'Asia/Kolkata', 'public', now() - interval '150 days', now() - interval '150 days'),
  (pg_temp.sid(1, 20), 'Nikhil T.', 'badminton', 'district', '2002-09-17', null, 'Asia/Kolkata', 'public', now() - interval '90 days', now() - interval '90 days'),
  (pg_temp.sid(1, 21), 'Dev M.', 'tennis', 'state', '2001-03-21', null, 'Asia/Kolkata', 'public', now() - interval '110 days', now() - interval '110 days'),
  (pg_temp.sid(1, 22), 'Zara F.', 'football', 'district', '2003-12-05', null, 'Asia/Kolkata', 'public', now() - interval '95 days', now() - interval '95 days'),
  (pg_temp.sid(1, 23), 'Omar H.', 'football', 'club', '2004-07-14', null, 'Asia/Kolkata', 'private', now() - interval '40 days', now() - interval '40 days'),
  (pg_temp.sid(1, 24), 'Lena P.', 'tennis', 'club', '2005-02-28', null, 'Asia/Kolkata', 'public', now() - interval '30 days', now() - interval '30 days'),
  (pg_temp.sid(1, 25), 'Vevek', null, null, '1985-05-05', null, 'Asia/Kolkata', 'private', now() - interval '200 days', now() - interval '200 days');
insert into admins (user_id, role) values (pg_temp.sid(1, 25), 'owner');

-- XP history: total XP (level) and this week's XP, as 'admin' rows (seed note).
-- (n, total, this_week)
with figures (n, total, week) as (values
  (2, 4320, 612), (3, 3360, 588), (4, 2740, 540), (5, 1980, 388), (6, 2290, 365), (7, 1200, 340), (8, 1500, 318),
  (9, 820, 290), (10, 1150, 276), (11, 900, 210), (12, 700, 180), (13, 1300, 160), (14, 640, 140), (15, 1900, 120), (16, 380, 95),
  (17, 560, 60), (18, 300, 40), (19, 4810, 604), (20, 2515, 455), (21, 3905, 571), (22, 3210, 498), (23, 760, 230), (24, 420, 80)),
week as (select local_day_start(ist_week_start(now()), 'Asia/Kolkata') as t0)
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
select pg_temp.sid(1, f.n), f.total - f.week, f.total - f.week, 'admin', (now() - interval '30 days')::date, now() - interval '30 days' from figures f where f.total - f.week > 0
union all
select pg_temp.sid(1, f.n), f.week, f.week, 'admin', (week.t0 at time zone 'Asia/Kolkata')::date, week.t0 + make_interval(mins => f.n) from figures f, week where f.week > 0;

-- Arjun: enrolled in Cricket Vision Foundations, 12 days done (days 1-12 on the last 12 days), an
-- earlier 19-day run, 1 freeze held, 140 coins, six badges, a baseline rating, Pro subscription.
insert into enrollments (id, user_id, program_id, started_at, start_local_date, current_day, last_completed_local_date, last_completed_session_id, is_active)
values (pg_temp.sid(1, 901), pg_temp.sid(1, 1), pg_temp.sid(3, 2), now() - interval '12 days', (local_date(now(), 'Asia/Kolkata') - 12), 13,
        local_date(now(), 'Asia/Kolkata') - 1, pg_temp.sid(5, 212), true);
insert into session_completions (user_id, session_id, local_date, completed_at)
select pg_temp.sid(1, 1), pg_temp.sid(5, 200 + d), local_date(now(), 'Asia/Kolkata') - 13 + d, local_day_start(local_date(now(), 'Asia/Kolkata') - 13 + d, 'Asia/Kolkata') + interval '19 hours'
from generate_series(1, 12) d;
-- drill completions behind those sessions (so Saccade Ladder has been done 9 times: Scan Master I unlocks on the next one)
insert into drill_completions (user_id, drill_id, session_id, completed_at, received_at, local_date, watch_pct, client_event_id)
select pg_temp.sid(1, 1), sd.drill_id, sd.session_id, sc.completed_at - interval '10 minutes' + make_interval(mins => sd."order" * 3), sc.completed_at, sc.local_date, 1,
       'seed-' || sd.session_id || '-' || sd.drill_id
from session_completions sc join session_drills sd on sd.session_id = sc.session_id where sc.user_id = pg_temp.sid(1, 1);
insert into drill_completions (user_id, drill_id, session_id, completed_at, received_at, local_date, watch_pct, client_event_id)
select pg_temp.sid(1, 1), pg_temp.sid(6, 3), null, local_day_start(local_date(now(), 'Asia/Kolkata') - 40 + d, 'Asia/Kolkata') + interval '7 hours', local_day_start(local_date(now(), 'Asia/Kolkata') - 40 + d, 'Asia/Kolkata') + interval '7 hours', local_date(now(), 'Asia/Kolkata') - 40 + d, 1, 'seed-saccade-' || d
from generate_series(1, 9 - (select count(*) from drill_completions where user_id = pg_temp.sid(1, 1) and drill_id = pg_temp.sid(6, 3))::integer) d;
-- earlier 19-day run ending 20 days ago, on the free Reset program and free drills (free_drill_id)
insert into session_completions (user_id, free_drill_id, local_date, completed_at)
select pg_temp.sid(1, 1), pg_temp.sid(6, 7), local_date(now(), 'Asia/Kolkata') - 38 + d, local_day_start(local_date(now(), 'Asia/Kolkata') - 38 + d, 'Asia/Kolkata') + interval '7 hours'
from generate_series(0, 18) d;
insert into freeze_ledger (user_id, amount, reason, created_at) values (pg_temp.sid(1, 1), 1, 'sub_grant', now() - interval '3 days');
insert into coin_ledger (user_id, amount, reason, created_at) values (pg_temp.sid(1, 1), 100, 'admin', now() - interval '25 days');
insert into user_badges (user_id, badge_id, awarded_at) values
  (pg_temp.sid(1, 1), pg_temp.sid(7, 1), now() - interval '38 days'), (pg_temp.sid(1, 1), pg_temp.sid(7, 2), now() - interval '36 days'),
  (pg_temp.sid(1, 1), pg_temp.sid(7, 3), now() - interval '32 days'), (pg_temp.sid(1, 1), pg_temp.sid(7, 4), now() - interval '25 days'),
  (pg_temp.sid(1, 1), pg_temp.sid(7, 10), now() - interval '26 days'), (pg_temp.sid(1, 1), pg_temp.sid(7, 16), now() - interval '9 days'),
  (pg_temp.sid(1, 1), pg_temp.sid(7, 13), now() - interval '6 days');
insert into self_ratings (user_id, area, rating, kind, taken_at) values
  (pg_temp.sid(1, 1), 'focus', 2, 'baseline', now() - interval '40 days'), (pg_temp.sid(1, 1), 'reaction', 3, 'baseline', now() - interval '40 days'),
  (pg_temp.sid(1, 1), 'tracking', 2, 'baseline', now() - interval '40 days');
select grant_entitlement(pg_temp.sid(1, 1), 'subscription', null, 'admin', now() - interval '40 days', now() + interval '20 days', 'seed', null, pg_temp.sid(1, 25), 'seed');
-- a few other subscribers and program owners
select grant_entitlement(pg_temp.sid(1, n), 'subscription', null, 'admin', now() - interval '30 days', now() + interval '30 days', 'seed', null, pg_temp.sid(1, 25), 'seed') from generate_series(2, 6) n;
select grant_entitlement(pg_temp.sid(1, 7), 'program', pg_temp.sid(3, 2), 'admin', now() - interval '30 days', null, 'seed', null, pg_temp.sid(1, 25), 'seed');
-- today's trainers (board: "11 of 20 trained today") and enrolments for the rest of the cricketers
insert into enrollments (user_id, program_id, started_at, start_local_date, current_day, is_active)
select pg_temp.sid(1, n), pg_temp.sid(3, 2), now() - interval '10 days', local_date(now(), 'Asia/Kolkata') - 10, 1, true from generate_series(2, 7) n;
insert into session_completions (user_id, free_drill_id, local_date, completed_at)
select pg_temp.sid(1, n), free_drill_of_day(local_date(now(), 'Asia/Kolkata')), local_date(now(), 'Asia/Kolkata'), now() - interval '1 hour'
from generate_series(8, 18) n;

-- ---------------------------------------------------------------- challenges
insert into challenges (id, type, title, description, goal, window_start, window_end, reward_xp, reward_coins, badge_id) values
  (pg_temp.sid(8, 1), 'weekly', '5 sessions this week', 'Complete five sessions between Monday and Sunday.', '{"metric":"sessions_total","gte":5}',
    local_day_start(ist_week_start(now()), 'Asia/Kolkata'), local_day_start(ist_week_start(now()) + 7, 'Asia/Kolkata'), 150, 40, pg_temp.sid(7, 16));
insert into challenges (id, type, title, description, goal, window_start, window_end, program_id, reward_xp, reward_coins) values
  (pg_temp.sid(8, 2), 'program', 'Finish Module 2 by Sunday', 'Complete every session of Track It Clean this week.', jsonb_build_object('metric', 'module_sessions', 'module_id', pg_temp.sid(4, 22)),
    local_day_start(ist_week_start(now()), 'Asia/Kolkata'), local_day_start(ist_week_start(now()) + 7, 'Asia/Kolkata'), pg_temp.sid(3, 2), 60, 0),
  (pg_temp.sid(8, 3), 'program', 'Score 25+ clean shifts on Near–Far', 'Log a best set of 25 or more on Near–Far Focus Shifts.', jsonb_build_object('metric', 'score_gte', 'drill_id', pg_temp.sid(6, 1), 'gte', 25),
    now() - interval '30 days', now() + interval '60 days', pg_temp.sid(3, 2), 40, 0);
-- progress rows so the cards can say how many joined. A challenge that is already met pays
-- its reward here; Arjun's totals are then normalised to the prototype's 2,040 XP and 140 coins.
select update_challenge_progress(pg_temp.sid(1, n)) from generate_series(1, 24) n;
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
values (pg_temp.sid(1, 1), 2040 - 412, 2040 - 412, 'admin', (now() - interval '30 days')::date, now() - interval '30 days');
insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
select pg_temp.sid(1, 1), 412 - w.earned, 412 - w.earned, 'admin', ist_week_start(now()), local_day_start(ist_week_start(now()), 'Asia/Kolkata') + interval '1 minute'
from (select coalesce(sum(amount), 0)::integer as earned from xp_ledger where user_id = pg_temp.sid(1, 1) and created_at >= local_day_start(ist_week_start(now()), 'Asia/Kolkata')) w
where 412 - w.earned > 0;
insert into coin_ledger (user_id, amount, reason, created_at)
select pg_temp.sid(1, 1), 140 - coin_balance(pg_temp.sid(1, 1)), 'admin', now() - interval '20 days' where coin_balance(pg_temp.sid(1, 1)) <> 140;

-- ---------------------------------------------------------------- caches
select rebuild_all_user_stats();
select rebuild_leaderboards();
