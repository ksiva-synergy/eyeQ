-- D11 and plan 6.6: an under-18 athlete is hidden from leaderboards by default, whichever
-- order the profile and the date of birth arrive in. Hidden means absent from the board's
-- rows, not only a flag: each case is ranked through leaderboard_refresh and read through
-- leaderboard_for as another athlete sees it.
select plan(9);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  w date := '2025-03-10';
  t0 timestamptz := local_day_start('2025-03-10', 'Asia/Kolkata');
  minor date := (current_date - interval '15 years')::date;
  viewer uuid := pg_temp.fx_user('Viewer');
  adult uuid := pg_temp.fx_user('Adult');                                  -- control
  with_dob uuid := gen_random_uuid();                                      -- profile and dob together
  dob_later uuid := gen_random_uuid();                                     -- profile first, dob after (onboarding)
  chose uuid := gen_random_uuid();                                         -- a minor who chooses to show
  lb jsonb;
  listed text[];
begin
  perform pg_temp.fx_auth_user(with_dob);
  insert into profiles (id, display_name, dob) values (with_dob, 'Together', minor);
  perform pg_temp.fx_auth_user(dob_later);
  insert into profiles (id, display_name) values (dob_later, 'Later');
  update profiles set dob = minor where id = dob_later;
  perform pg_temp.fx_auth_user(chose);
  insert into profiles (id, display_name) values (chose, 'Chose');
  update profiles set dob = minor where id = chose;
  update profiles set visibility = 'public' where id = chose;

  return next is((select visibility from profiles where id = with_dob), 'private', 'profile created with a minor''s date of birth: private');
  return next is((select visibility from profiles where id = dob_later), 'private', 'date of birth set after the profile: private');

  insert into xp_ledger (user_id, amount, requested_amount, reason, local_date, created_at)
  select u, 500, 500, 'admin', w, t0 + interval '1 hour' from unnest(array[adult, with_dob, dob_later, chose]) u;
  perform leaderboard_refresh(t0 + interval '2 hours');
  lb := leaderboard_for(viewer, 'week', 'global', 10, t0 + interval '2 hours');
  select array_agg(r->>'user_id') into listed from jsonb_array_elements(lb->'rows') r;

  return next ok(adult::text = any(listed), 'an adult is listed');
  return next ok(not (with_dob::text = any(listed)), 'the minor created with a date of birth is not listed');
  return next ok(not (dob_later::text = any(listed)), 'the minor whose date of birth came later is not listed');
  return next ok(chose::text = any(listed), 'a minor who chose to show is listed (D11 sets the default, not a ban)');
  return next ok((select count(*) from leaderboard_weekly where user_id = with_dob and scope = 'global') = 1, 'the hidden minor still has a rank of their own');
  return next ok((leaderboard_for(with_dob, 'week', 'global', 10, t0 + interval '2 hours'))->'me'->>'rank' is not null, 'and sees their own row');
  return next ok((select count(*) from leaderboard_weekly where user_id in (with_dob, dob_later) and is_public) = 0, 'neither hidden minor is marked public on the board');
end $$;
select pg_temp.t();
select * from finish();
