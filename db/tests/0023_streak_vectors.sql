-- Streak from facts: packages/game/vectors/streak.json (plan 6.4)
select plan(jsonb_array_length(pg_temp.vec('streak')->'cases')::integer * 3);
insert into drills (id, title, video_provider, video_ref, access) values ('00000000-0000-4000-a000-00000000d001', 'free', 'youtube', 'x', 'free_pool');

create function pg_temp.streak_case(c jsonb) returns setof text language plpgsql as $$
declare u uuid := pg_temp.fx_user('sv'); d jsonb; today date := (c->>'today')::date;
begin
  for d in select * from jsonb_array_elements(c->'days') loop
    if d->>1 = 'c' then
      insert into session_completions (user_id, free_drill_id, local_date, completed_at) values (u, '00000000-0000-4000-a000-00000000d001', (d->>0)::date, local_day_start((d->>0)::date, 'Asia/Kolkata') + interval '19 hours');
    else
      insert into freeze_ledger (user_id, amount, reason, created_at) values (u, 1, 'admin', local_day_start((d->>0)::date, 'Asia/Kolkata') - interval '1 day');
      insert into freeze_ledger (user_id, amount, reason, local_date) values (u, -1, 'used', (d->>0)::date);
    end if;
  end loop;
  return next is(current_streak(u, today), (c->>'current')::integer, (c->>'name') || ': current');
  return next is(best_streak(u), (c->>'best')::integer, (c->>'name') || ': best');
  return next is(streak_run(u, today - 1), (c->>'before')::integer, (c->>'name') || ': before today');
end $$;
select pg_temp.streak_case(c) from jsonb_array_elements(pg_temp.vec('streak')->'cases') c;
select * from finish();
