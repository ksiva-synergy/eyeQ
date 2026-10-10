-- Supabase's Data API roles reach nothing in public: no schema USAGE, no table, sequence
-- or function grant (migrations 0013, 0014). The vitest data-api test makes real calls.
-- pgTAP's own objects are skipped: the test runner installs it and it never exists hosted.
select plan(12);
create function pg_temp.is_pgtap(p_oid oid) returns boolean language sql stable as $f$
  select exists (select 1 from pg_depend d join pg_extension e on e.oid = d.refobjid
                 where d.objid = p_oid and d.deptype = 'e' and e.extname = 'pgtap')
$f$;
create function pg_temp.t() returns setof text language plpgsql as $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    return next ok(not has_schema_privilege(r, 'public', 'USAGE'), r || ' has no USAGE on schema public');
    return next ok(not has_schema_privilege(r, 'public', 'CREATE'), r || ' has no CREATE on schema public');
    return next is((select count(*) from pg_class c
                    where c.relnamespace = 'public'::regnamespace and not pg_temp.is_pgtap(c.oid)
                      and case when c.relkind not in ('r', 'v', 'm', 'p', 'f') then false else (has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                           or has_any_column_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) end),
                   0::bigint, r || ' holds no privilege on any table or view');
    return next is((select count(*) from pg_class c
                    where c.relnamespace = 'public'::regnamespace
                      and case when c.relkind = 'S' then has_sequence_privilege(r, c.oid, 'USAGE,SELECT,UPDATE') else false end),
                   0::bigint, r || ' holds no privilege on any sequence');
    return next is((select count(*) from pg_proc p
                    where p.pronamespace = 'public'::regnamespace
                      and has_function_privilege(r, p.oid, 'EXECUTE')
                      and has_schema_privilege(r, p.pronamespace, 'USAGE')),
                   0::bigint, r || ' can call no function in public');
    return next is((select count(*) from pg_proc p
                    where p.proowner = 'eyeq_owner'::regrole
                      and has_function_privilege(r, p.oid, 'EXECUTE')),
                   0::bigint, r || ' holds EXECUTE on no EyeQ function');
  end loop;
end $$;
select pg_temp.t();
select * from finish();
