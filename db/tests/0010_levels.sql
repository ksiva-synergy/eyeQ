-- Level thresholds, level for XP, rank titles: packages/game/vectors/levels.json (plan 6.2, D1, D12)
select plan((
  jsonb_array_length(pg_temp.vec('levels')->'thresholds')
  + jsonb_array_length(pg_temp.vec('levels')->'level_for_xp')
  + (select count(*) from jsonb_array_elements(pg_temp.vec('levels')->'level_for_xp') c where c ? 'to_next')
  + jsonb_array_length(pg_temp.vec('levels')->'rank_titles'))::integer);

select is(level_threshold((c->>'level')::integer), (c->>'threshold')::integer, format('level %s starts at %s XP', c->>'level', c->>'threshold'))
from jsonb_array_elements(pg_temp.vec('levels')->'thresholds') c;

select is(level_for_xp((c->>'xp')::integer), (c->>'level')::integer, format('%s XP is level %s', c->>'xp', c->>'level'))
from jsonb_array_elements(pg_temp.vec('levels')->'level_for_xp') c;

select is((level_progress((c->>'xp')::integer)->>'to_next')::integer, (c->>'to_next')::integer, format('%s XP is %s from the next level', c->>'xp', c->>'to_next'))
from jsonb_array_elements(pg_temp.vec('levels')->'level_for_xp') c where c ? 'to_next';

select is(rank_title((c->>'level')::integer), c->>'title', format('level %s is %s', c->>'level', c->>'title'))
from jsonb_array_elements(pg_temp.vec('levels')->'rank_titles') c;

select * from finish();
