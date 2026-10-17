-- Phase 7: Razorpay state into entitlements (0023). Payments and subscriptions are passed in
-- as the entities Razorpay returns; the clock moves by argument.
select plan(48);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  u uuid := pg_temp.fx_user('payer');
  other uuid := pg_temp.fx_user('payer-other');
  p uuid := pg_temp.fx_program(2, false, 2, true);
  d_ppv uuid := gen_random_uuid();
  d_ppv2 uuid := gen_random_uuid();
  prod_prog uuid := gen_random_uuid();
  prod_drill uuid := gen_random_uuid();
  prod_sub uuid := gen_random_uuid();
  c_prog uuid; c_drill uuid; c_sub uuid;
  t0 timestamptz := '2026-10-01T06:00:00Z';
  e1 bigint := extract(epoch from t0)::bigint;
  pay jsonb;
  r jsonb;
  ev uuid;
  ent uuid;
  n integer;
begin
  insert into products (id, kind, title, price_paise, grants) values
    (prod_prog, 'program', 'Test program', 99900, jsonb_build_object('scope', 'program', 'scope_id', p)),
    (prod_drill, 'drill', 'PPV', 9900, '{"scope":"drill"}'),
    (prod_sub, 'subscription', 'Pro monthly', 29900, '{"scope":"subscription","duration_days":30}');
  update programs set product_id = prod_prog where id = p;
  insert into drills (id, title, video_provider, video_ref, measurement_tag, access, ppv_product_id, duration_minutes, score_type, score_direction, status)
  values (d_ppv, 'PPV one', 'youtube', 'x', 'executive-scan', 'ppv', prod_drill, 3, 'none', 'higher', 'published'),
         (d_ppv2, 'PPV two', 'youtube', 'y', 'executive-scan', 'ppv', prod_drill, 3, 'none', 'higher', 'published');
  update profiles set billing_email = 'payer@example.com' where id = u;
  insert into checkouts (user_id, product_id, kind, scope, scope_id, external_id, amount_paise) values
    (u, prod_prog, 'order', 'program', p, 'order_prog', 99900) returning id into c_prog;
  insert into checkouts (user_id, product_id, kind, scope, scope_id, external_id, amount_paise) values
    (u, prod_drill, 'order', 'drill', d_ppv, 'order_drill', 9900) returning id into c_drill;
  insert into checkouts (user_id, product_id, kind, scope, scope_id, external_id, amount_paise) values
    (u, prod_sub, 'subscription', 'subscription', null, 'sub_1', 29900) returning id into c_sub;

  -- ---------------------------------------------------------- the event queue
  r := store_payment_event('razorpay', 'evt_1', 'payment.captured', '{"a":1}', t0);
  return next is((r->>'new')::boolean, true, 'a new event is stored');
  ev := (r->>'id')::uuid;
  r := store_payment_event('razorpay', 'evt_1', 'payment.captured', '{"a":1}', t0);
  return next is((r->>'new')::boolean, false, 'the same event id is stored once');
  return next is((r->>'id')::uuid, ev, 'and the repeat returns the stored row');
  return next is((select count(*)::integer from payment_events_due(20, 10, interval '2 minutes', t0 + interval '5 minutes') x where x = ev), 1,
    'an unprocessed event is due for the sweep');
  return next is((select count(*)::integer from payment_events_due(20, 10, interval '2 minutes', t0 + interval '1 minute') x where x = ev), 0,
    'but not while the request that stored it may still be processing it');

  -- ---------------------------------------------------------- one-time: a program
  return next is(has_access(u, 'program', p, t0), false, 'no access before paying');
  pay := jsonb_build_object('id', 'pay_prog', 'status', 'authorized', 'order_id', 'order_prog', 'amount', 99900, 'currency', 'INR');
  r := razorpay_payment_captured(pay, 'webhook', ev, t0);
  return next is((r->>'granted')::boolean, false, 'an authorised payment grants nothing');
  pay := pay || '{"status":"captured"}';
  r := razorpay_payment_captured(pay, 'webhook', ev, t0);
  return next is((r->>'granted')::boolean, true, 'a captured payment grants');
  return next is(r->>'product_kind', 'program', 'and reports the product kind');
  return next is(has_access(u, 'program', p, t0 + interval '400 days'), true, 'the program is open for life');
  ent := (r->>'entitlement_id')::uuid;
  r := razorpay_payment_captured(pay, 'refresh', null, t0 + interval '2 seconds');
  return next is((r->>'granted')::boolean, false, 'the refresh after the webhook is a no-op');
  return next is(r->>'reason', 'already_granted', 'because the payment already granted');
  return next is((select count(*)::integer from entitlement_events where entitlement_id = ent), 1, 'one entitlement event for the payment');
  return next is((select count(*)::integer from payment_grants where payment_id = 'pay_prog'), 1, 'one grant row');
  return next is((select count(*)::integer from notifications where user_id = u and kind = 'receipt' and channel = 'email'), 1,
    'one receipt queued, by email');
  return next is((select data->>'email' from notifications where user_id = u and kind = 'receipt'), 'payer@example.com',
    'to the checkout email');

  -- ---------------------------------------------------------- one-time: one pay-per-view drill
  r := razorpay_payment_captured(jsonb_build_object('id', 'pay_drill', 'status', 'captured', 'order_id', 'order_drill',
    'amount', 9900, 'currency', 'INR'), 'webhook', null, t0);
  return next is(has_access(u, 'drill', d_ppv, t0), true, 'the bought drill opens');
  return next is(has_access(u, 'drill', d_ppv2, t0), false, 'another drill on the same product does not');
  return next is(has_access(other, 'drill', d_ppv, t0), false, 'nor does it open for anyone else');

  -- ---------------------------------------------------------- one-time: refused
  r := razorpay_payment_captured(jsonb_build_object('id', 'pay_bad', 'status', 'captured', 'order_id', 'order_prog',
    'amount', 100, 'currency', 'INR'), 'webhook', null, t0);
  return next is(r->>'reason', 'amount_mismatch', 'a payment for the wrong amount grants nothing');
  return next is((select count(*)::integer from payment_flags where kind = 'amount_mismatch' and external_id = 'pay_bad'), 1, 'and is flagged');
  r := razorpay_payment_captured(jsonb_build_object('id', 'pay_stray', 'status', 'captured', 'order_id', 'order_nobody',
    'amount', 100, 'currency', 'INR'), 'webhook', null, t0);
  return next is((select count(*)::integer from payment_flags where kind = 'unmatched_payment' and external_id = 'pay_stray'), 1,
    'a payment for no checkout of ours is flagged');
  r := razorpay_payment_captured(jsonb_build_object('id', 'pay_subcharge', 'status', 'captured', 'order_id', 'order_inv',
    'invoice_id', 'inv_1', 'amount', 29900, 'currency', 'INR'), 'webhook', null, t0);
  return next is((select count(*)::integer from payment_flags where external_id = 'pay_subcharge'), 0,
    'a subscription charge (it carries an invoice) is left to the subscription sync');

  -- ---------------------------------------------------------- subscriptions
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'authenticated'), null, 'webhook', null, t0);
  return next is(has_active_subscription(u, t0), false, 'authenticated but not charged: no Pro yet');
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'active', 'current_start', e1, 'current_end', e1 + 30 * 86400),
    jsonb_build_object('id', 'pay_s1', 'status', 'captured', 'amount', 29900), 'webhook', null, t0);
  return next is(r->>'change', 'granted', 'the first charge grants Pro');
  return next is((r->>'granted')::boolean, true, 'and records its payment');
  ent := (r->>'entitlement_id')::uuid;
  return next is(has_access(u, 'program', p, t0), true, 'Pro opens a program in the subscription');
  return next is((select ends_at from entitlements where id = ent), t0 + interval '30 days', 'to the period end');
  n := (select count(*)::integer from entitlement_events where entitlement_id = ent);
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'active', 'current_start', e1, 'current_end', e1 + 30 * 86400),
    jsonb_build_object('id', 'pay_s1', 'status', 'captured', 'amount', 29900), 'refresh', null, t0);
  return next is((select count(*)::integer from entitlement_events where entitlement_id = ent), n, 'syncing the same state again writes nothing');
  return next is((r->>'granted')::boolean, false, 'and the payment is not counted twice');
  -- renewal
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'active', 'current_start', e1 + 30 * 86400, 'current_end', e1 + 60 * 86400),
    jsonb_build_object('id', 'pay_s2', 'status', 'captured', 'amount', 29900), 'webhook', null, t0 + interval '30 days');
  return next is(r->>'change', 'extended', 'a renewal extends');
  return next is((select ends_at from entitlements where id = ent), t0 + interval '60 days', 'ends_at moves to the new period end');
  -- failed renewal, then halted
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'pending', 'current_start', e1 + 30 * 86400, 'current_end', e1 + 60 * 86400),
    null, 'webhook', null, t0 + interval '60 days');
  return next is((select status from entitlements where id = ent), 'grace', 'a failing charge puts Pro in grace');
  return next is((select ends_at from entitlements where id = ent), t0 + interval '63 days', 'for the configured grace days');
  return next is(has_access(u, 'program', p, t0 + interval '61 days'), true, 'grace still opens content');
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'halted', 'current_start', e1 + 30 * 86400, 'current_end', e1 + 60 * 86400),
    null, 'webhook', null, t0 + interval '62 days');
  return next is((select status from entitlements where id = ent), 'ended', 'halted ends Pro');
  return next is(has_access(u, 'program', p, t0 + interval '62 days 1 hour'), true, 'the program bought once stays open');
  -- the card is fixed and the next charge succeeds
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'active', 'current_start', e1 + 62 * 86400, 'current_end', e1 + 92 * 86400),
    jsonb_build_object('id', 'pay_s3', 'status', 'captured', 'amount', 29900), 'webhook', null, t0 + interval '62 days 2 hours');
  return next is(r->>'change', 'reactivated', 'a charge after halted reactivates the same entitlement');
  -- cancelled at cycle end: runs to the period end, then the hourly sweep ends it
  r := razorpay_subscription_sync(jsonb_build_object('id', 'sub_1', 'status', 'cancelled', 'current_start', e1 + 62 * 86400, 'current_end', e1 + 92 * 86400),
    null, 'webhook', null, t0 + interval '70 days');
  return next is((select status from entitlements where id = ent), 'active', 'cancelled keeps Pro to the period end');
  perform entitlement_expiry(t0 + interval '91 days');
  return next is((select status from entitlements where id = ent), 'active', 'the sweep leaves it before the end');
  perform entitlement_expiry(t0 + interval '92 days 1 minute');
  return next is((select status from entitlements where id = ent), 'ended', 'and ends it after');
  return next is((select status from provider_subscriptions where external_id = 'sub_1'), 'cancelled', 'Account sees the provider status');

  -- ---------------------------------------------------------- refunds and disputes
  r := razorpay_refund(jsonb_build_object('id', 'rfnd_1', 'payment_id', 'pay_drill', 'amount', 4000),
    jsonb_build_object('id', 'pay_drill', 'amount', 9900, 'amount_refunded', 4000, 'refund_status', 'partial'), null, t0 + interval '1 day');
  return next is(has_access(u, 'drill', d_ppv, t0 + interval '1 day'), true, 'a partial refund changes no access');
  return next is((select count(*)::integer from payment_flags where kind = 'partial_refund' and external_id = 'rfnd_1'), 1, 'and is flagged');
  r := razorpay_refund(jsonb_build_object('id', 'rfnd_2', 'payment_id', 'pay_drill', 'amount', 5900),
    jsonb_build_object('id', 'pay_drill', 'amount', 9900, 'amount_refunded', 9900, 'refund_status', 'full'), null, t0 + interval '1 day');
  return next is(has_access(u, 'drill', d_ppv, t0 + interval '1 day 1 second'), false, 'a full refund locks at once');
  r := razorpay_dispute('payment.dispute.created', jsonb_build_object('id', 'disp_1', 'payment_id', 'pay_prog', 'amount', 99900), null, t0 + interval '2 days');
  return next is(has_access(u, 'program', p, t0 + interval '2 days'), true, 'an open dispute changes no access');
  r := razorpay_dispute('payment.dispute.lost', jsonb_build_object('id', 'disp_1', 'payment_id', 'pay_prog', 'amount', 99900), null, t0 + interval '3 days');
  return next is((select change from entitlement_events where entitlement_id = (select entitlement_id from payment_grants where payment_id = 'pay_prog')
    order by seq desc limit 1), 'revoked', 'a lost dispute revokes what the payment granted');

  -- ---------------------------------------------------------- the near-ledgers
  return next throws_ok(format('update payment_grants set via = %L where payment_id = %L', 'sweep', 'pay_prog'), '42501', null,
    'payment_grants is append-only');
end $$;
select pg_temp.t();
select * from finish();
