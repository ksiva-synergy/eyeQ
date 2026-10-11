-- Streak multiplier and session arithmetic: packages/game/vectors/xp.json (plan 6.1, D14)
select plan((
  jsonb_array_length(pg_temp.vec('xp')->'multiplier')
  + 4 * jsonb_array_length(pg_temp.vec('xp')->'sessions')
  + jsonb_array_length(pg_temp.vec('xp')->'round_half_up'))::integer);

select is(1 + streak_multiplier((c->>'streak')::integer), (c->>'factor')::numeric, format('streak %s gives x%s', c->>'streak', c->>'factor'))
from jsonb_array_elements(pg_temp.vec('xp')->'multiplier') c;

-- Each session is recomputed here as the engine computes it, field by field, like the
-- TypeScript runner: drill XP through drill_xp() for every drill in the vector (a value
-- other than the default is a per-drill override), the bonus from game_config, the
-- multiplier through multiplier_bonus() on drill XP plus bonus (D14), then the total.
create temp view pg_temp.session_calc as
select c->>'name' as name, c,
  (select sum(drill_xp(jsonb_populate_record(null::drills,
     jsonb_build_object('xp', case when x::integer = config_int('xp.drill') then null else x::integer end))))::integer
   from jsonb_array_elements_text(c->'drills') x) as drill_xp,
  config_int('xp.session_bonus') as bonus
from jsonb_array_elements(pg_temp.vec('xp')->'sessions') c;

select is(drill_xp, (c->>'drill_xp')::integer, name || ': drill XP from the drills') from pg_temp.session_calc;
select is(bonus, (c->>'bonus')::integer, name || ': session bonus from game_config') from pg_temp.session_calc;
select is(multiplier_bonus(drill_xp + bonus, (c->>'streak')::integer), (c->>'multiplier')::integer, name || ': multiplier')
from pg_temp.session_calc;
select is(drill_xp + bonus + multiplier_bonus(drill_xp + bonus, (c->>'streak')::integer), (c->>'total')::integer, name || ': total')
from pg_temp.session_calc;

select is(round_half_up((c->>'value')::numeric), (c->>'rounded')::integer, format('round_half_up(%s) = %s', c->>'value', c->>'rounded'))
from jsonb_array_elements(pg_temp.vec('xp')->'round_half_up') c;

select * from finish();
