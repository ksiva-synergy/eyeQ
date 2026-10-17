-- Every entitlement change leaves an entitlement_events row; expiry sweep; access questions (rules 2 and 4)
select plan(12);
create function pg_temp.t() returns setof text language plpgsql as $$
declare p uuid := pg_temp.fx_program(1, false, 2, true); u uuid := pg_temp.fx_user('ent'); e1 entitlements; s1 entitlements; s2 entitlements; s3 entitlements;
begin
  return next is(has_access(u, 'program', p), false, 'no access without an entitlement');
  e1 := grant_entitlement(u, 'program', p, 'razorpay', now(), null, 'order_1');
  return next is((select count(*) from entitlement_events where entitlement_id = e1.id), 1::bigint, 'grant writes one event');
  return next is(has_access(u, 'program', p), true, 'lifetime program access');
  s1 := grant_entitlement(u, 'subscription', null, 'razorpay', now() - interval '1 day', now() + interval '1 day', 'sub_1');
  s2 := grant_entitlement(u, 'subscription', null, 'razorpay', now(), now() + interval '31 days', 'sub_1');
  return next is(s2.id, s1.id, 'a renewal extends the same entitlement');
  return next is((select count(*) from entitlement_events where entitlement_id = s1.id), 2::bigint, 'granted + extended');
  perform end_entitlement(s1.id, 'refund', now(), null, null, true);
  return next is((select status from entitlements where id = s1.id), 'ended', 'ended on refund');
  return next is((select change from entitlement_events where entitlement_id = s1.id order by at desc, seq desc limit 1), 'revoked', 'the event says revoked');
  return next is(has_active_subscription(u), false, 'no subscription after the refund');
  s3 := grant_entitlement(u, 'subscription', null, 'play', now() - interval '40 days', now() - interval '1 hour', 'sub_old');
  return next is(entitlement_expiry(), 1, 'the sweep ends the expired one');
  return next is((select count(*) from entitlement_events where entitlement_id = s3.id and change = 'ended'), 1::bigint, 'with an event');
  set constraints all immediate;
  return next throws_ok(format('update entitlements set status = %L where id = %L', 'active', s3.id), '42501', null, 'changing an entitlement without an event is refused');
  return next is(has_access(u, 'drill', (pg_temp.fx_drills(pg_temp.fx_session(p, 1)))[1]), true, 'an included drill follows its program');
end $$;
select pg_temp.t();
select * from finish();
