-- Caches are rebuildable: rebuild equals cache (rule 3)
select plan(3);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(6); u uuid := pg_temp.fx_user('rb'); v uuid := pg_temp.fx_user('rb2', 'Asia/Kolkata', 'tennis'); before text; lb_before text;
begin
  perform pg_temp.fx_streak(u, p, 5, current_date - 1);
  perform pg_temp.fx_streak(v, p, 2, current_date - 1);
  perform earn_coins(u, 70, 'admin'); perform spend_coins(u, 20, 'spend_freeze'); perform add_freeze(u, 'coin_purchase');
  perform leaderboard_refresh();
  select (to_jsonb(s) - 'updated_at')::text into before from user_stats s where user_id = u;
  perform rebuild_user_stats(u);
  return next is((select (to_jsonb(s) - 'updated_at')::text from user_stats s where user_id = u), before, 'rebuild_user_stats equals the cache kept by complete_drill');
  select string_agg(format('%s|%s|%s|%s|%s', scope, scope_value, user_id, xp, rank), ';' order by scope, scope_value, user_id) into lb_before
  from leaderboard_weekly where week_start = ist_week_start(now());
  perform rebuild_leaderboards();
  return next is((select string_agg(format('%s|%s|%s|%s|%s', scope, scope_value, user_id, xp, rank), ';' order by scope, scope_value, user_id)
                  from leaderboard_weekly where week_start = ist_week_start(now())), lb_before, 'rebuild_leaderboards equals the refreshed board');
  return next ok((select count(*) from leaderboard_weekly where user_id = u) >= 2, 'the athlete is on the global and sport boards');
end $$;
select pg_temp.t();
select * from finish();
