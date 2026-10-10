-- Loaded as the admin role. Supabase's Data API roles exist on the Supabase image and
-- hosted projects; plain Postgres (local compose, CI) gets throwaway stand-ins, rolled
-- back with each file, so the lockout test checks the same thing everywhere.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
