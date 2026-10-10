-- First sign-in creates the profile and user_stats rows; profiles.id references auth.users.
select plan(9);
create function pg_temp.t() returns setof text language plpgsql as $$
declare u uuid := pg_temp.fx_auth_user(); stranger uuid := gen_random_uuid();
begin
  set local role eyeq_api;
  perform set_config('app.user_id', u::text, true);
  return next is(ensure_my_profile('  Kavya Iyer  '), true, 'the first call creates the profile');
  return next is((select display_name from profiles where id = u), 'Kavya Iyer', 'display name trimmed from the provider');
  return next is((select count(*) from user_stats where user_id = u), 1::bigint, 'user_stats row created');
  return next is(ensure_my_profile('Someone Else'), false, 'a repeat call creates nothing');
  return next is((select display_name from profiles where id = u), 'Kavya Iyer', 'and changes nothing');
  perform set_config('app.user_id', '', true);
  return next throws_ok('select ensure_my_profile()', '28000', null, 'needs an athlete in context');
  reset role;
  return next throws_ok(format('select ensure_profile_for(%L)', stranger), '23503', null,
    'a profile needs an auth user (foreign key to auth.users)');
  return next is((select convalidated from pg_constraint where conname = 'profiles_id_fkey'), true,
    'the foreign key is validated on a database whose profiles all have auth users');
  update profiles set goal = 'Track the seam' where id = u;
  return next ok((select updated_at from profiles where id = u) >= (select created_at from profiles where id = u),
    'updated_at follows changes');
end $$;
select pg_temp.t();
select * from finish();
