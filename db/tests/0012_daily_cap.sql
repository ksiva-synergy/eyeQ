-- Daily cap with truncation and the exempt reasons: packages/game/vectors/cap.json (plan 6.1, D13)
select plan(jsonb_array_length(pg_temp.vec('cap')->'cases')::integer * 2);

create function pg_temp.cap_case(c jsonb) returns setof text language plpgsql as $$
declare u uuid := pg_temp.fx_user('cap'); x xp_ledger; d date := current_date;
begin
  if (c->>'so_far')::integer > 0 then
    insert into xp_ledger (user_id, amount, requested_amount, reason, local_date) values (u, (c->>'so_far')::integer, (c->>'so_far')::integer, 'drill', d);
  end if;
  x := award_xp(u, (c->>'requested')::integer, c->>'reason', null, d);
  return next is(x.amount, (c->>'awarded')::integer, format('%s so far, %s +%s awards %s', c->>'so_far', c->>'reason', c->>'requested', c->>'awarded'));
  return next is(x.truncated, (c->>'truncated')::boolean, format('... truncated = %s', c->>'truncated'));
end $$;

select pg_temp.cap_case(c) from jsonb_array_elements(pg_temp.vec('cap')->'cases') c;

select * from finish();
