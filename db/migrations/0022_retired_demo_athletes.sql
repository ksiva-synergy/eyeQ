-- Demo athletes retired by `pnpm demo:refresh` are marked, and the admin athlete list (and
-- the QA athlete picker, which reads the same function) leaves them out unless asked.
-- Additive: a new nullable column, and admin_athletes_for gains a trailing parameter with a
-- default, so the previous release's four-argument calls resolve to it unchanged.
set role eyeq_owner;

alter table profiles add column retired_at timestamptz;
comment on column profiles.retired_at is
  'Set by pnpm demo:refresh on demo athletes it replaced; null for every real athlete.';

drop function admin_athletes_for(text, text, integer, integer, timestamptz);
create function admin_athletes_for(p_search text default null, p_plan text default null,
  p_limit integer default 50, p_offset integer default 0, p_at timestamptz default now(),
  p_include_retired boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[]; v_total integer; v_rows jsonb;
begin
  if p_plan is not null and p_plan not in ('pro', 'program', 'free') then
    raise exception 'plan must be pro, program or free' using errcode = '22023';
  end if;
  select array_agg(p.id order by athlete_last_active(p.id) desc nulls last, p.created_at desc) into v_ids
  from profiles p
  where (coalesce(trim(p_search), '') = ''
         or p.display_name ilike '%' || trim(p_search) || '%'
         or p.id in (select athletes_by_phone(p_search)))
    and (p_plan is null or athlete_plan(p.id, p_at) = p_plan)
    and (p_include_retired or p.retired_at is null);
  v_total := coalesce(array_length(v_ids, 1), 0);
  if p_limit > 0 then v_ids := v_ids[p_offset + 1 : p_offset + p_limit]; end if;
  select coalesce(jsonb_agg(athlete_row(p, ph.phone_masked, p_at) order by ord.n), '[]'::jsonb) into v_rows
  from unnest(coalesce(v_ids, '{}')) with ordinality ord (id, n)
  join profiles p on p.id = ord.id
  left join athlete_phones_masked(v_ids) ph on ph.user_id = p.id;
  return jsonb_build_object('total', v_total,
    'active_this_week', (select count(distinct user_id) from drill_completions
                         where received_at > p_at - interval '7 days' and received_at <= p_at),
    'athletes', v_rows);
end $$;

grant execute on function admin_athletes_for(text, text, integer, integer, timestamptz, boolean) to eyeq_service;

reset role;
