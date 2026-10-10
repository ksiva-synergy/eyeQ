-- Coins: spend in the same transaction, never below zero (plan 6.5)
select plan(6);
create function pg_temp.t() returns setof text language plpgsql as $$
declare u uuid := pg_temp.fx_user('coins');
begin
  perform earn_coins(u, 50, 'admin');
  return next is(coin_balance(u), 50, 'earned 50');
  return next lives_ok(format('select spend_coins(%L, 50, %L)', u, 'spend_freeze'), 'spending the whole balance works');
  return next is(coin_balance(u), 0, 'balance 0');
  return next throws_like(format('select spend_coins(%L, 1, %L)', u, 'spend_freeze'), 'insufficient_coins%', 'overspend is refused');
  return next throws_ok(format('insert into coin_ledger (user_id, amount, reason) values (%L, -1, %L)', u, 'admin'), 'P0001', null, 'a direct negative row is refused by the ledger trigger');
  return next is((select coins from user_stats where user_id = u), 0, 'cache follows the ledger');
end $$;
select pg_temp.t();
select * from finish();
