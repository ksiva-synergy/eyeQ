-- rate_limit_hit: limits from game_config, fixed windows, callable by eyeq_api (plan 5.2).
select plan(10);
create function pg_temp.t() returns setof text language plpgsql as $$
declare t0 timestamptz := '2030-01-07 10:00:05+00'; res jsonb; i integer;
begin
  set local role eyeq_api;
  for i in 1..5 loop
    res := rate_limit_hit('otp_phone', '+919800000001', t0 + make_interval(mins => i));
  end loop;
  return next is((res ->> 'allowed')::boolean, true, 'the fifth OTP request in the hour is allowed');
  return next is((res ->> 'limit')::integer, 5, 'the limit comes from rate.otp_per_phone_per_hour');
  res := rate_limit_hit('otp_phone', '+919800000001', t0 + interval '10 minutes');
  return next is((res ->> 'allowed')::boolean, false, 'the sixth OTP request in the window is refused');
  return next is((res ->> 'retry_after')::integer, 3000 - 5 + 0, 'retry_after runs to the end of the window');
  res := rate_limit_hit('otp_phone', '+919800000002', t0 + interval '10 minutes');
  return next is((res ->> 'allowed')::boolean, true, 'another phone has its own counter');
  res := rate_limit_hit('otp_sms_phone', '+919800000001', t0 + interval '10 minutes');
  return next is((res ->> 'allowed')::boolean, true, 'the SMS hook counts separately from the request form');
  res := rate_limit_hit('otp_phone', '+919800000001', t0 + interval '1 hour');
  return next is((res ->> 'allowed')::boolean, true, 'the next window starts afresh');
  return next throws_ok($q$select rate_limit_hit('nope', 'x')$q$, '22023', null, 'unknown rule refused');
  return next throws_ok($q$select rate_limit_hit('otp_ip', '')$q$, '22004', null, 'a subject is required');
  return next throws_ok('select * from rate_limits', '42501', null, 'eyeq_api cannot read the counters directly');
end $$;
select pg_temp.t();
select * from finish();
