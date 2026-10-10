-- Coach admin athletes: list, search, plan filter, masked phone, detail (plan phase 4, rule 11)
select plan(15);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  tag text := left(gen_random_uuid()::text, 8);
  a uuid := pg_temp.fx_auth_user(gen_random_uuid(), '919876543210');
  b uuid := pg_temp.fx_user('Zed ' || tag);
  coach uuid := pg_temp.fx_user('Coach ' || tag);
  prog uuid := pg_temp.fx_program(1, false, 1);
  r jsonb; row_a jsonb; det jsonb; ent entitlements;
begin
  insert into profiles (id, display_name, sport, dob) values (a, 'Asha ' || tag, 'cricket', '2012-05-01');
  perform ensure_user_stats(a);

  r := admin_athletes_for(tag);
  return next is((r->>'total')::int, 3, 'search by name finds the three test athletes');
  select x into row_a from jsonb_array_elements(r->'athletes') x where (x->>'id')::uuid = a;
  return next is(row_a->>'phone_masked', '+91 ••••• •3210', 'the phone is masked to country code and last four');
  return next ok(r::text not like '%9876543210%' and r::text not like '%98765%', 'the full number appears nowhere');
  return next ok(r::text not like '%2012-05-01%' and r::text not like '%dob%', 'date of birth never leaves the server');
  return next is(row_a->>'plan', 'free', 'no entitlement: Free');

  r := admin_athletes_for('6543');
  return next ok(exists (select 1 from jsonb_array_elements(r->'athletes') x where (x->>'id')::uuid = a), 'search by phone digits finds the athlete');
  return next is((admin_athletes_for('654'))->>'total', (select count(*)::text from profiles where display_name ilike '%654%'), 'fewer than four digits does not search phones');

  ent := grant_entitlement(a, 'program', prog, 'admin', now(), null, null, null, coach, 'comp for the trial');
  r := admin_athletes_for(tag, 'program');
  return next is((r->>'total')::int, 1, 'plan filter: Program');
  return next is((admin_athletes_for(tag, 'free'))->>'total', '2', 'plan filter: Free');
  return next is(jsonb_array_length((admin_athletes_for(tag, null, 1, 1))->'athletes'), 1, 'pagination returns one page');
  return next ok((r->>'active_this_week')::int >= 0, 'the header carries the active-this-week count');

  det := admin_athlete_detail_for(a);
  return next is(det->>'is_minor', 'true', 'detail says minor, not the date');
  return next is(det->'entitlements'->0->'events'->0->>'reason', 'comp for the trial', 'the manual grant and its reason are on the athlete page');
  return next ok(exists (select 1 from jsonb_array_elements(det->'timeline') x where x->>'kind' = 'entitlement'), 'the grant is in the timeline');

  set local role eyeq_api;
  return next throws_ok(format('select admin_athletes_for(%L)', tag), '42501', null, 'athletes cannot call the admin list');
end $$;
select pg_temp.t();
select * from finish();
