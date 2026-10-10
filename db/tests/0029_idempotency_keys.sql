-- idempotency_keys: own rows only for eyeq_api; responses cannot be rewritten by others.
select plan(5);
create function pg_temp.t() returns setof text language plpgsql as $$
declare a uuid := pg_temp.fx_user('ida'); b uuid := pg_temp.fx_user('ben');
begin
  set local role eyeq_api;
  perform set_config('app.user_id', b::text, true);
  insert into idempotency_keys (user_id, key, route, request_hash) values (b, 'key-bbbbbbbb', 'PATCH /me', 'h');
  perform set_config('app.user_id', a::text, true);
  insert into idempotency_keys (user_id, key, route, request_hash) values (a, 'key-aaaaaaaa', 'PATCH /me', 'h');
  update idempotency_keys set status = 200, response = '{"ok":true}', completed_at = now() where key = 'key-aaaaaaaa';
  return next is((select count(*) from idempotency_keys), 1::bigint, 'ida sees only her keys');
  return next is((select status from idempotency_keys where key = 'key-aaaaaaaa'), 200, 'she records her response');
  return next throws_ok(format($q$insert into idempotency_keys (user_id, key, route, request_hash) values (%L, 'key-forged00', 'x', 'h')$q$, b),
    '42501', null, 'she cannot write a key for ben');
  update idempotency_keys set response = '{"hacked":true}' where key = 'key-bbbbbbbb';
  reset role;
  return next is((select response from idempotency_keys where key = 'key-bbbbbbbb'), null::jsonb, 'ben''s row is untouched');
  set local role eyeq_api;
  perform set_config('app.user_id', a::text, true);
  return next throws_ok($q$update idempotency_keys set route = 'other'$q$, '42501', null, 'the route is not updatable');
end $$;
select pg_temp.t();
select * from finish();
