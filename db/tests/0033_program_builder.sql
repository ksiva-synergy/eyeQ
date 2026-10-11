-- Program builder: publish validation and deferrable ordering (plan phase 4)
select plan(13);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  p uuid := pg_temp.fx_program(2, false, 2);       -- paid, not in the subscription, no product
  empty uuid := gen_random_uuid();
  m uuid; s1 uuid; s2 uuid; d uuid; prod uuid; r jsonb;
begin
  select id into m from modules where program_id = p;
  select id into s1 from sessions where program_id = p and day_number = 1;
  select id into s2 from sessions where program_id = p and day_number = 2;

  r := program_publish_check(p);
  return next is(r->>'ok', 'false', 'a fresh paid program is not publishable');
  return next ok(r->'problems' @> '[{"code": "no_price"}]', 'a paid program needs a priced product');
  return next is((select count(*)::int from jsonb_array_elements(r->'problems') x where x->>'code' = 'video_unchecked'), 4, 'every unchecked video is listed');

  update drills set link_status = 'ok' where id in (select drill_id from session_drills where session_id in (s1, s2));
  insert into products (kind, title, price_paise, grants) values ('program', 'Test', 49900, jsonb_build_object('scope', 'program', 'scope_id', p)) returning id into prod;
  update programs set product_id = prod where id = p;
  r := program_publish_check(p);
  return next is(r->>'ok', 'true', 'checked videos and a priced product: publishable');

  select drill_id into d from session_drills where session_id = s2 order by "order" limit 1;
  update drills set link_status = 'broken', link_reason = 'not_found' where id = d;
  r := program_publish_check(p);
  return next ok(r->'problems' @> jsonb_build_array(jsonb_build_object('code', 'video_broken', 'drill_id', d, 'day', 2, 'reason', 'not_found')), 'a broken link is refused with its reason and day');

  update drills set link_status = 'ok', link_reason = null, video_provider = 'drive' where id = d;
  r := program_publish_check(p);
  return next is(r->>'ok', 'true', 'a Drive link does not block');
  return next ok(r->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'drive_paid', 'drill_id', d)), 'but a paid drill on Drive is warned about');

  update drills set access = 'ppv' where id = d;
  return next ok(program_publish_check(p)->'problems' @> jsonb_build_array(jsonb_build_object('code', 'ppv_no_price', 'drill_id', d)), 'a pay-per-view drill needs its own priced product');
  update drills set access = 'included' where id = d;

  insert into modules (id, program_id, "order", title) values (empty, p, 2, 'Empty');
  insert into sessions (program_id, module_id, day_number) values (p, empty, 3) returning id into s1;
  r := program_publish_check(p);
  return next ok(r->'problems' @> jsonb_build_array(jsonb_build_object('code', 'empty_session', 'day', 3)), 'a session without drills is refused');
  return next ok(r->'problems' @> '[{"code": "too_many_sessions", "sessions": 3, "days": 2}]', 'more sessions than days is refused');
  delete from sessions where id = s1;
  return next ok(program_publish_check(p)->'problems' @> jsonb_build_array(jsonb_build_object('code', 'empty_module', 'module_id', empty)), 'a module without sessions is refused');

  -- Swap two days in one statement pair: only possible because the constraint is deferred.
  update sessions set day_number = 2 where program_id = p and module_id = m and day_number = 1 and id <> s2;
  update sessions set day_number = 1 where id = s2;
  set constraints all immediate;
  return next is((select day_number from sessions where id = s2), 1, 'days can pass through each other in one transaction');

  set local role eyeq_api;
  return next throws_ok(format('select program_publish_check(%L)', p), '42501', null, 'athletes cannot run the publish check');
end $$;
select * from pg_temp.t();
select * from finish();
