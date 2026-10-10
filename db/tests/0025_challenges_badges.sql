-- Weekly challenge completion, badges by metric, level-up coins (plan 6.2, 6.7)
select plan(9);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(5); u uuid := pg_temp.fx_user('cb'); r1 jsonb; r2 jsonb; r3 jsonb;
begin
  insert into badges (id, slug, name, description, family, rule, coins) values
    ('00000000-0000-4000-a000-00000000b001', 't-first-rep', 'First Rep', 'Finish a session', 'consistency', '{"metric":"sessions_total","gte":1}', 10),
    ('00000000-0000-4000-a000-00000000b002', 't-scan-2', 'Scan II', '2 scan drills', 'volume', '{"metric":"drills_with_tag","tag":"executive-scan","gte":2}', 5),
    ('00000000-0000-4000-a000-00000000b003', 't-five', 'Five-a-Week', 'Win a weekly challenge', 'community', '{"metric":"weekly_challenge_wins","gte":1}', 20);
  insert into challenges (id, type, title, goal, window_start, window_end, reward_xp, reward_coins, badge_id) values
    ('00000000-0000-4000-a000-00000000c001', 'weekly', '2 sessions', '{"metric":"sessions_total","gte":2}', now() - interval '2 days', now() + interval '2 days', 150, 40, '00000000-0000-4000-a000-00000000b003');
  perform enroll_for(u, p);
  r1 := pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 1), now() - interval '1 day');
  return next is((select b->>'slug' from jsonb_array_elements(r1->'badges') b limit 1), 't-first-rep', 'First Rep on the first session');
  return next is((select c->>'progress' from jsonb_array_elements(r1->'challenges') c where c->>'id' = '00000000-0000-4000-a000-00000000c001'), '1', 'challenge progress 1/2');
  r2 := pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 2), now() - interval '1 hour');
  return next is((select c->>'newly_completed' from jsonb_array_elements(r2->'challenges') c where c->>'id' = '00000000-0000-4000-a000-00000000c001'), 'true', 'challenge completes on the second session');
  return next is((select amount from xp_ledger where user_id = u and reason = 'challenge' and source_id = '00000000-0000-4000-a000-00000000c001'), 150, '+150 XP');
  return next ok(exists (select 1 from coin_ledger where user_id = u and reason = 'challenge' and amount = 40), '+40 coins');
  return next ok(exists (select 1 from user_badges where user_id = u and badge_id = '00000000-0000-4000-a000-00000000b003'), 'the challenge badge');
  return next ok(exists (select 1 from user_badges where user_id = u and badge_id = '00000000-0000-4000-a000-00000000b002'), 'Scan II after two executive-scan drills');
  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date) values (u, 150, 150, 'admin', current_date);
  r3 := pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 3), now() - interval '30 minutes');
  return next is((select level from user_stats where user_id = u), 2, 'level 2 reached during the third session');
  return next ok(exists (select 1 from coin_ledger where user_id = u and reason = 'level_up' and amount = 20), '20 coins for the level');
end $$;
select pg_temp.t();
select * from finish();
