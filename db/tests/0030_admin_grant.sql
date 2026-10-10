-- grant_admin_for: the only writer of admins; writes audit_log in the same transaction.
select plan(6);
create function pg_temp.t() returns setof text language plpgsql as $$
declare u uuid := pg_temp.fx_auth_user(); n bigint := (select count(*) from audit_log);
begin
  set local role eyeq_service;
  perform grant_admin_for(u, 'coach');
  return next is((select role from admins where user_id = u), 'coach', 'a coach is created (profile made on the way)');
  perform grant_admin_for(u, 'owner');
  return next is((select role from admins where user_id = u), 'owner', 'a second grant changes the role');
  return next is((select count(*) from audit_log) - n, 2::bigint, 'each grant writes one audit row');
  return next is((select before ->> 'role' from audit_log where target_id = u::text and before is not null),
    'coach', 'the audit row records what it was');
  return next throws_ok(format($q$select grant_admin_for(%L, 'admin')$q$, u), '22023', null, 'only coach or owner');
  reset role;
  set local role eyeq_api;
  return next throws_ok(format($q$select grant_admin_for(%L, 'owner')$q$, u), '42501', null, 'athletes cannot grant');
end $$;
select pg_temp.t();
select * from finish();
