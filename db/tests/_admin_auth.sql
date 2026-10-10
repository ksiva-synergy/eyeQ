-- Loaded as the admin role (postgres) before the runner switches to eyeq_owner.
-- auth.users belongs to Supabase Auth (or the local stand-in from migration 0014), and
-- eyeq_owner cannot write it, so fixtures create auth users through this definer function.
create function pg_temp.fx_auth_user(p_id uuid default gen_random_uuid(), p_phone text default null) returns uuid
language sql security definer as $$
  insert into auth.users (id, phone) values (p_id, p_phone) returning id
$$;
