-- 0024: refunds decided from the refunds themselves; a failed refund gives access back.
select plan(14);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  u uuid := pg_temp.fx_user('refund-failed');
  p uuid := pg_temp.fx_program(1, false, 1, false);
  prod uuid := gen_random_uuid();
  t0 timestamptz := '2026-10-01T06:00:00Z';
  pay jsonb := '{"id": "pay_rf", "status": "captured", "order_id": "order_rf", "amount": 99900, "currency": "INR"}';
  full_pending jsonb := '{"id": "rfnd_full", "payment_id": "pay_rf", "amount": 99900, "status": "pending"}';
  r jsonb;
  ent uuid;
begin
  insert into products (id, kind, title, price_paise, grants) values (prod, 'program', 'P', 99900, jsonb_build_object('scope', 'program', 'scope_id', p));
  insert into checkouts (user_id, product_id, kind, scope, scope_id, external_id, amount_paise) values (u, prod, 'order', 'program', p, 'order_rf', 99900);
  r := razorpay_payment_captured(pay, 'webhook', null, t0);
  ent := (r->>'entitlement_id')::uuid;
  return next is(has_access(u, 'program', p, t0), true, 'bought');

  -- refund.created: a full refund, still pending, locks at once
  r := razorpay_refund_sync(pay, jsonb_build_array(full_pending), full_pending, null, t0 + interval '1 day');
  return next is(r->>'change', 'revoked', 'a pending full refund ends access');
  return next is(has_access(u, 'program', p, t0 + interval '1 day 1 second'), false, 'locked at once');
  r := razorpay_refund_sync(pay, jsonb_build_array(full_pending || '{"status":"processed"}'), full_pending || '{"status":"processed"}', null, t0 + interval '2 days');
  return next is(r->>'change', null, 'refund.processed after it changes nothing');
  return next is((select count(*)::integer from entitlement_events where entitlement_id = ent), 2, 'granted + revoked');
  return next is((select count(*)::integer from payment_flags where external_id = 'rfnd_full'), 0, 'a full refund is not flagged as partial');

  -- refund.failed: access comes back, as it was, with an event
  r := razorpay_refund_sync(pay, jsonb_build_array(full_pending || '{"status":"failed"}'), full_pending || '{"status":"failed"}', null, t0 + interval '3 days');
  return next is(r->>'change', 'reactivated', 'a failed refund restores access');
  return next is(has_access(u, 'program', p, t0 + interval '400 days'), true, 'for life again, as bought');
  return next is((select change || ':' || reason from entitlement_events where entitlement_id = ent order by seq desc limit 1),
    'reactivated:refund_failed', 'with an entitlement_events row');
  r := razorpay_refund_sync(pay, jsonb_build_array(full_pending || '{"status":"failed"}'), full_pending || '{"status":"failed"}', null, t0 + interval '3 days');
  return next is((select count(*)::integer from entitlement_events where entitlement_id = ent), 3, 'a replayed refund.failed changes nothing');
  return next is((select count(*)::integer from payment_flags where external_id = 'rfnd_full'), 0, 'and raises no partial flag');

  -- a partial refund flags and keeps access; a refund failing after a lost dispute restores nothing
  r := razorpay_refund_sync(pay, '[{"id": "rfnd_part", "amount": 10000, "status": "processed"}]', '{"id": "rfnd_part", "amount": 10000, "status": "processed"}', null, t0 + interval '4 days');
  return next is(has_access(u, 'program', p, t0 + interval '4 days'), true, 'a partial refund keeps access');
  return next is((select count(*)::integer from payment_flags where kind = 'partial_refund' and external_id = 'rfnd_part'), 1, 'and is flagged');
  perform razorpay_dispute('payment.dispute.lost', '{"id": "disp_rf", "payment_id": "pay_rf", "amount": 99900}', null, t0 + interval '5 days');
  r := razorpay_refund_sync(pay, '[]', full_pending || '{"status":"failed"}', null, t0 + interval '6 days');
  return next is(has_access(u, 'program', p, t0 + interval '6 days'), false, 'an end made by a lost dispute is not undone by a failed refund');
end $$;
select pg_temp.t();
select * from finish();
