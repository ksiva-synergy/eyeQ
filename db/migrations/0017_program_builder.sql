-- Phase 4 · program builder (plan phase 4, board 17).
--  1. Ordering constraints become deferrable, so a reorder can move modules, sessions and
--     drills through each other's positions inside one transaction.
--  2. Link check results on drills. Not granted to eyeq_api: athletes never see them.
--  3. Publish validation in one function, tested in pgTAP: blocking problems and
--     non-blocking warnings, as codes with the values a message needs.
set role eyeq_owner;

-- ---------------------------------------------------------------- 1. deferrable order
alter table modules drop constraint modules_program_id_order_key,
  add constraint modules_program_id_order_key unique (program_id, "order") deferrable initially deferred;
alter table sessions drop constraint sessions_program_id_day_number_key,
  add constraint sessions_program_id_day_number_key unique (program_id, day_number) deferrable initially deferred;
alter table session_drills drop constraint session_drills_session_id_order_key,
  add constraint session_drills_session_id_order_key unique (session_id, "order") deferrable initially deferred;

-- ---------------------------------------------------------------- 2. link check
alter table drills
  add column link_status text not null default 'unchecked' check (link_status in ('unchecked', 'ok', 'broken')),
  add column link_reason text,                 -- why it is broken: not_found, private, not_embeddable, not_shared, …
  add column link_checked_at timestamptz,
  add column video_duration_seconds integer check (video_duration_seconds >= 0),
  add column video_privacy text;               -- youtube: public, unlisted, private; drive: anyone_with_link

-- ---------------------------------------------------------------- 3. publish check
-- A program is paid when it is neither free nor in the subscription; then it needs an
-- active product with a price. A drill is paid when it is pay-per-view, or included in a
-- program that is not free.
create function program_publish_check(p_program_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p programs;
  v_problems jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_sessions integer;
  r record;
begin
  select * into p from programs where id = p_program_id;
  if not found then return null; end if;

  if not exists (select 1 from modules where program_id = p.id) then
    v_problems := v_problems || jsonb_build_object('code', 'no_modules');
  end if;
  for r in select m.id, m.title from modules m
           where m.program_id = p.id and not exists (select 1 from sessions s where s.module_id = m.id) order by m."order" loop
    v_problems := v_problems || jsonb_build_object('code', 'empty_module', 'module_id', r.id, 'title', r.title);
  end loop;
  for r in select s.id, s.day_number from sessions s
           where s.program_id = p.id and not exists (select 1 from session_drills sd where sd.session_id = s.id) order by s.day_number loop
    v_problems := v_problems || jsonb_build_object('code', 'empty_session', 'session_id', r.id, 'day', r.day_number);
  end loop;

  select count(*) into v_sessions from sessions where program_id = p.id;
  if v_sessions > p.duration_days then
    v_problems := v_problems || jsonb_build_object('code', 'too_many_sessions', 'sessions', v_sessions, 'days', p.duration_days);
  end if;

  if not p.is_free and not p.in_subscription and not exists (
       select 1 from products pr where pr.id = p.product_id and pr.active and pr.price_paise > 0) then
    v_problems := v_problems || jsonb_build_object('code', 'no_price');
  end if;

  for r in select distinct on (d.id) d.id, d.title, d.link_status, d.link_reason, d.video_provider, d.access, d.ppv_product_id, s.day_number
           from session_drills sd join sessions s on s.id = sd.session_id join drills d on d.id = sd.drill_id
           where s.program_id = p.id order by d.id, s.day_number loop
    if r.link_status = 'broken' then
      v_problems := v_problems || jsonb_build_object('code', 'video_broken', 'drill_id', r.id, 'title', r.title, 'day', r.day_number, 'reason', r.link_reason);
    elsif r.link_status <> 'ok' then
      v_problems := v_problems || jsonb_build_object('code', 'video_unchecked', 'drill_id', r.id, 'title', r.title, 'day', r.day_number);
    end if;
    if r.access = 'ppv' and not exists (
         select 1 from products pr where pr.id = r.ppv_product_id and pr.active and pr.price_paise > 0) then
      v_problems := v_problems || jsonb_build_object('code', 'ppv_no_price', 'drill_id', r.id, 'title', r.title, 'day', r.day_number);
    end if;
    -- The PRD wants YouTube unlisted for anything paid: Drive files can be downloaded.
    if r.video_provider = 'drive' and (r.access = 'ppv' or (r.access = 'included' and not p.is_free)) then
      v_warnings := v_warnings || jsonb_build_object('code', 'drive_paid', 'drill_id', r.id, 'title', r.title, 'day', r.day_number);
    end if;
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(v_problems) = 0, 'problems', v_problems, 'warnings', v_warnings);
end $$;

grant execute on function program_publish_check(uuid) to eyeq_service;

reset role;
