-- Streak multiplier and session arithmetic: packages/game/vectors/xp.json (plan 6.1, D14)
select plan((
  jsonb_array_length(pg_temp.vec('xp')->'multiplier')
  + jsonb_array_length(pg_temp.vec('xp')->'sessions')
  + jsonb_array_length(pg_temp.vec('xp')->'round_half_up'))::integer);

select is(1 + streak_multiplier((c->>'streak')::integer), (c->>'factor')::numeric, format('streak %s gives x%s', c->>'streak', c->>'factor'))
from jsonb_array_elements(pg_temp.vec('xp')->'multiplier') c;

select is(
  (c->>'drill_xp')::integer + (c->>'bonus')::integer + multiplier_bonus((c->>'drill_xp')::integer + (c->>'bonus')::integer, (c->>'streak')::integer),
  (c->>'total')::integer, c->>'name')
from jsonb_array_elements(pg_temp.vec('xp')->'sessions') c;

select is(round_half_up((c->>'value')::numeric), (c->>'rounded')::integer, format('round_half_up(%s) = %s', c->>'value', c->>'rounded'))
from jsonb_array_elements(pg_temp.vec('xp')->'round_half_up') c;

select * from finish();
