-- Ground rule 2 and plan 5.3, in full: eyeq_api can insert, update and delete none of the
-- six ledgers, the entitlement state, the user_stats cache or the boards; and the
-- append-only trigger refuses update and delete on every ledger even for the owner.
-- (0017 covered the XP and coin inserts only; the phase 5 evidence audit found the rest.)
select plan(31);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  u uuid := pg_temp.fx_user('ledgers');
  p uuid := pg_temp.fx_program(1);
  tbl text;
  -- a column each table has, for the update probes
  col jsonb := '{"entitlement_events": "reason", "audit_log": "action"}';
begin
  -- one row in every ledger, written the way the engine writes them
  perform pg_temp.fx_complete_session(u, pg_temp.fx_session(p, 1), now() - interval '2 hours');
  insert into coin_ledger (user_id, amount, reason) values (u, 50, 'admin');
  insert into credit_ledger (user_id, amount, reason) values (u, 5, 'admin');
  perform add_freeze(u, 'sub_grant');
  perform grant_entitlement(u, 'program', p, 'admin', now(), null, null, null, null, 'test');
  perform grant_admin_for(u, 'coach', 'script', null);

  set local role eyeq_api;
  perform set_config('app.user_id', u::text, true);
  foreach tbl in array array['xp_ledger', 'coin_ledger', 'credit_ledger', 'freeze_ledger', 'entitlement_events',
                             'audit_log', 'entitlements', 'user_stats', 'leaderboard_weekly'] loop
    return next throws_ok(format('insert into %I default values', tbl), '42501', null, format('api cannot insert into %s', tbl));
    return next throws_ok(format('update %I set %2$I = %2$I', tbl, coalesce(col->>tbl, 'user_id')), '42501', null, format('api cannot update %s', tbl));
  end loop;
  foreach tbl in array array['xp_ledger', 'coin_ledger', 'credit_ledger', 'freeze_ledger', 'entitlement_events', 'audit_log'] loop
    return next throws_ok(format('delete from %I', tbl), '42501', null, format('api cannot delete from %s', tbl));
  end loop;
  reset role;

  -- The trigger holds even for the role that owns the tables (rule 2: privileges and a trigger).
  set local role eyeq_owner;
  foreach tbl in array array['xp_ledger', 'coin_ledger', 'credit_ledger', 'freeze_ledger', 'entitlement_events'] loop
    return next throws_ok(format('update %I set %2$I = %2$I', tbl, coalesce(col->>tbl, 'user_id')), '42501', null, format('owner cannot update %s', tbl));
  end loop;
  return next throws_ok(format('delete from xp_ledger where user_id = %L', u), '42501', null, 'owner cannot delete XP rows');
  return next throws_ok(format('delete from audit_log where target_id = %L', u::text), '42501', null, 'owner cannot delete audit rows');
  reset role;
end $$;
select pg_temp.t();
select * from finish();
