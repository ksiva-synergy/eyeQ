-- Read endpoints for phase 4: catalogue, program detail, session detail (plan section 7, rule 5)
select plan(16);
create function pg_temp.t() returns setof text language plpgsql as $$
declare
  u uuid := pg_temp.fx_user('reader');
  free_p uuid := pg_temp.fx_program(2, true, 2);
  paid_p uuid := pg_temp.fx_program(1, false, 2);
  draft_p uuid := pg_temp.fx_program(1, true, 1);
  cat jsonb; card jsonb; det jsonb; sd jsonb; s_free uuid; s_paid uuid; s_draft uuid;
begin
  update programs set status = 'draft' where id = draft_p;
  s_free := pg_temp.fx_session(free_p, 1);
  s_paid := pg_temp.fx_session(paid_p, 1);
  s_draft := pg_temp.fx_session(draft_p, 1);

  cat := catalog_programs_for(u);
  return next ok(exists (select 1 from jsonb_array_elements(cat) c where (c->>'id')::uuid = free_p), 'a published program is listed');
  return next ok(not exists (select 1 from jsonb_array_elements(cat) c where (c->>'id')::uuid = draft_p), 'a draft program is not listed');
  select c into card from jsonb_array_elements(cat) c where (c->>'id')::uuid = free_p;
  return next is(card->>'session_count', '2', 'card counts sessions');
  return next is(card->>'drill_count', '4', 'card counts drills');
  return next is(card->'measurement_groups', '["cognition", "vision"]'::jsonb, 'card lists the measurement groups its drills cover');
  return next is((select c->>'has_access' from jsonb_array_elements(cat) c where (c->>'id')::uuid = paid_p), 'false', 'a paid program without an entitlement is not accessible');

  det := program_detail_for(u, (select slug from programs where id = free_p));
  return next is(jsonb_array_length(det->'modules'->0->'sessions'), 2, 'detail nests sessions under modules');
  return next ok(det->'modules'->0->'unlocked' = 'null'::jsonb, 'unlock state is null before enrolment');
  return next is(program_detail_for(u, (select slug from programs where id = draft_p)), null::jsonb, 'a draft program reads as missing');
  return next is(program_detail_for(u, 'no-such-program'), null::jsonb, 'an unknown slug reads as missing');

  sd := session_detail_for(u, s_free);
  return next is(jsonb_array_length(sd->'drills'), 2, 'session detail lists its drills');
  return next is(sd->'drills'->0->>'locked', 'false', 'a drill of a free program is unlocked');
  return next is((session_detail_for(u, s_paid))->'drills'->0->>'locked', 'true', 'a drill of a paid program is locked without an entitlement');
  return next is(session_detail_for(u, s_draft), null::jsonb, 'a session of a draft program reads as missing');
  -- Rule 5: the video reference appears nowhere in any read payload, as a key or a value.
  return next ok(not exists (
      select 1 from drills d join session_drills x on x.drill_id = d.id
      where x.session_id in (s_free, s_paid)
        and (cat::text || det::text || sd::text || session_detail_for(u, s_paid)::text) like '%' || d.video_ref || '%'),
    'no video_ref value in any payload');
  return next ok((cat::text || det::text || sd::text) not like '%video_ref%', 'no video_ref key in any payload');
end $$;
select pg_temp.t();
select * from finish();
