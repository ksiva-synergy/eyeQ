-- Week rollover at Sunday 18:30 UTC: final ranks, podium badge, subscriber freezes with cap, next challenge (plan 6.6, 6.7, D3)
select plan(9);
create function pg_temp.t() returns setof text language plpgsql as $$
declare t timestamptz := '2025-03-09 18:30+00';   -- Monday 2025-03-10 00:00 IST (a week no seed touches)
        p1 uuid := pg_temp.fx_user('P1'); p2 uuid := pg_temp.fx_user('P2'); s2 uuid := pg_temp.fx_user('S2', 'Asia/Kolkata', 'tennis'); r jsonb;
begin
  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at) values
    (p1, 300, 300, 'admin', '2025-03-04', '2025-03-04 10:00+05:30'),
    (p2, 200, 200, 'admin', '2025-03-05', '2025-03-05 10:00+05:30');
  insert into badges (slug, name, description, family, rule, coins, evaluated_on) values
    ('t-top3', 'Top 3', 'Finish a week on the podium', 'community', '{"metric":"weekly_rank_lte","scope":"global","lte":3}', 30, 'weekly');
  perform grant_entitlement(p1, 'subscription', null, 'admin', t - interval '10 days', t + interval '20 days');
  perform grant_entitlement(s2, 'subscription', null, 'admin', t - interval '10 days', t + interval '20 days');
  perform add_freeze(p1, 'coin_purchase'); perform add_freeze(p1, 'coin_purchase');
  insert into challenges (type, title, goal, window_start, window_end, reward_xp, reward_coins) values
    ('weekly', '5 sessions this week', '{"metric":"sessions_total","gte":5}', '2025-03-02 18:30+00', '2025-03-09 18:30+00', 150, 40);
  r := week_rollover(t);
  return next is(r->>'finalised_week', '2025-03-03', 'last week is finalised');
  return next ok((select bool_and(final) from leaderboard_weekly where week_start = '2025-03-03'), 'last week''s rows are final');
  return next is((select rank from leaderboard_weekly where week_start = '2025-03-03' and scope = 'global' and user_id = p1), 1, 'P1 finished first');
  return next ok(exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = p1 and b.slug = 't-top3'), 'P1 earns the podium badge');
  return next ok(exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = p2 and b.slug = 't-top3'), 'P2 (second) earns it too');
  return next is(freezes_held(p1), 2, 'subscriber at the cap gets no third freeze');
  return next is(freezes_held(s2), 1, 'subscriber below the cap gets one');
  return next is((select count(*) from challenges where type = 'weekly' and window_start = t), 1::bigint, 'the weekly challenge repeats into the new week');
  return next is((select count(*) from leaderboard_weekly where week_start = '2025-03-03' and not final), 0::bigint, 'nothing from last week is left open');
end $$;
select pg_temp.t();
select * from finish();
