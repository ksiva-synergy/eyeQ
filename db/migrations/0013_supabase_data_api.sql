-- Supabase: EyeQ serves its own API from apps/web (plan section 2), so Supabase's
-- auto-generated Data API (PostgREST, GraphQL) must reach nothing in public.
-- Supabase grants anon and authenticated everything that postgres creates in public
-- (schema_migrations, extension objects) through default privileges. Remove that
-- reach. Schema USAGE granted by supabase_admin survives (postgres cannot revoke it),
-- which is harmless without object grants; eyeq_owner never grants to these roles.
-- Also switch the Data API off in the dashboard; this migration is the backstop.
-- Local compose and CI have no anon/authenticated roles, so this does nothing there.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke usage on schema public from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on tables from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
