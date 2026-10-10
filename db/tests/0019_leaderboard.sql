-- Weekly board: order, ties by earlier arrival, private profiles hidden but ranked (plan 6.6, D25)
select plan(11);
create function pg_temp.t() returns setof text language plpgsql as $$
declare a uuid := pg_temp.fx_user('A'); b uuid := pg_temp.fx_user('B'); c uuid := pg_temp.fx_user('C', 'Asia/Kolkata', 'cricket', 'private');
        d uuid := pg_temp.fx_user('D', 'Asia/Kolkata', 'tennis'); w date := '2025-03-10'; t0 timestamptz := local_day_start('2025-03-10', 'Asia/Kolkata'); lb jsonb;
begin
  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at) values
    (b, 600, 600, 'admin', w, t0 + interval '1 hour'),
    (a, 600, 600, 'admin', w, t0 + interval '2 hours'),
    (c, 700, 700, 'admin', w, t0 + interval '3 hours'),
    (d, 500, 500, 'admin', w, t0 + interval '4 hours'),
    (a, 1, 1, 'admin', w - 7, t0 - interval '1 day');
  perform leaderboard_refresh(t0 + interval '5 hours');
  return next is((select rank from leaderboard_weekly where user_id = b and scope = 'global'), 1, 'B ranks first: same XP as A, reached earlier');
  return next is((select rank from leaderboard_weekly where user_id = a and scope = 'global'), 2, 'A second');
  return next is((select rank from leaderboard_weekly where user_id = d and scope = 'global'), 3, 'D third');
  return next is((select rank from leaderboard_weekly where user_id = c and scope = 'global'), 1, 'private C has a rank of her own (nobody public is ahead)');
  return next is((select xp from leaderboard_weekly where user_id = a and scope = 'global'), 600, 'last week''s row is not counted');
  return next is((select rank from leaderboard_weekly where user_id = d and scope = 'sport' and scope_value = 'tennis'), 1, 'D leads the tennis board');
  lb := leaderboard_for(a, 'week', 'global', 10, t0 + interval '5 hours');
  return next is(lb->>'count', '3', 'three public athletes');
  return next is((select count(*) from jsonb_array_elements(lb->'rows') r where r->>'user_id' = c::text), 0::bigint, 'the private athlete is not listed');
  return next is(lb->'me'->>'rank', '2', 'the athlete''s own row');
  return next is(lb->'me'->'gap_above'->>'display_name', 'B', 'gap to the row above');
  return next is(lb->'me'->'gap_above'->>'xp', '0', 'tied on XP');
end $$;
select pg_temp.t();
select * from finish();
