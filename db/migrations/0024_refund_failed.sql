-- Phase 7 follow-up · refunds decided from the refunds themselves, and a failed refund gives
-- access back. 0023's razorpay_refund read the payment's amount_refunded, which Razorpay's
-- docs do not say falls back when a refund fails (their refund.failed sample still shows
-- it), so a failed full refund left access ended and could raise a false partial flag.
--
-- razorpay_refund_sync takes the payment and the list of its refunds as fetched from
-- Razorpay (GET /payments/{id}/refunds). Money counts as going back while a refund is
-- pending or processed; a failed one does not count.
--   * refunds that count cover the captured amount -> what the payment granted ends at
--     once (revoked, reason refund), so a full refund locks on refund.created
--   * they no longer do, and the entitlement was ended by that refund -> it is restored
--     to its state before the refund (reactivated, reason refund_failed), with an
--     entitlement_events row; nothing is restored if that end date has already passed
--   * a refund for less than the payment that has not failed -> flagged, access unchanged
-- Additive: 0023's razorpay_refund stays for the previous release (plan 2.4).
set role eyeq_owner;

create function razorpay_refund_sync(p_payment jsonb, p_refunds jsonb, p_refund jsonb default null,
                                     p_payment_event_id uuid default null, p_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay text := p_payment ->> 'id';
  v_amount integer := (p_payment ->> 'amount')::integer;
  v_counted integer;
  g payment_grants;
  e entitlements;
  v_last entitlement_events;
  v_before jsonb;
  v_status text;
  v_ends timestamptz;
begin
  if v_pay is null or v_amount is null then raise exception 'payment without id or amount' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('razorpay:payment:' || v_pay));
  select coalesce(sum((r ->> 'amount')::integer), 0) into v_counted
  from jsonb_array_elements(coalesce(p_refunds, '[]'::jsonb)) r
  where r ->> 'status' in ('pending', 'processed');
  select * into g from payment_grants where provider = 'razorpay' and payment_id = v_pay;

  -- A refund for part of the payment that has not failed: a person looks, access stays.
  if p_refund is not null and coalesce(p_refund ->> 'status', '') <> 'failed'
     and (p_refund ->> 'amount')::integer < v_amount then
    perform raise_payment_flag('partial_refund', p_refund ->> 'id', g.user_id, p_payment_event_id,
      jsonb_build_object('payment_id', v_pay, 'refund_amount', p_refund -> 'amount', 'refunded', v_counted, 'amount', v_amount));
  end if;

  if g.entitlement_id is null then return jsonb_build_object('change', null, 'reason', 'no_grant', 'refunded', v_counted); end if;
  select * into e from entitlements where id = g.entitlement_id for update;

  if v_counted >= v_amount then
    if e.status = 'ended' then return jsonb_build_object('change', null, 'reason', 'already_ended', 'refunded', v_counted); end if;
    perform end_entitlement(e.id, 'refund', p_at, p_payment_event_id, null, true);
    return jsonb_build_object('change', 'revoked', 'entitlement_id', e.id, 'user_id', g.user_id, 'refunded', v_counted);
  end if;

  -- Not (or no longer) fully refunded: undo an end that a refund made, and only that.
  if e.status <> 'ended' then return jsonb_build_object('change', null, 'refunded', v_counted); end if;
  select * into v_last from entitlement_events where entitlement_id = e.id order by seq desc limit 1;
  if v_last.change <> 'revoked' or v_last.reason is distinct from 'refund' then
    return jsonb_build_object('change', null, 'reason', 'ended_otherwise', 'refunded', v_counted);
  end if;
  select snapshot into v_before from entitlement_events
  where entitlement_id = e.id and seq < v_last.seq order by seq desc limit 1;
  v_status := coalesce(v_before ->> 'status', 'active');
  v_ends := (v_before ->> 'ends_at')::timestamptz;
  if v_status = 'ended' or (v_ends is not null and v_ends <= p_at) then
    return jsonb_build_object('change', null, 'reason', 'period_over', 'refunded', v_counted);
  end if;
  update entitlements set status = v_status, ends_at = v_ends, updated_at = now()
  where id = e.id returning * into e;
  insert into entitlement_events (entitlement_id, change, reason, payment_event_id, snapshot)
  values (e.id, 'reactivated', 'refund_failed', p_payment_event_id, entitlement_snapshot(e));
  return jsonb_build_object('change', 'reactivated', 'entitlement_id', e.id, 'user_id', g.user_id, 'refunded', v_counted);
end $$;

grant execute on function razorpay_refund_sync(jsonb, jsonb, jsonb, uuid, timestamptz) to eyeq_service;

reset role;
