-- Trivial phase 0 test: the runner works and the base extensions exist.
select plan(3);
select has_extension('pgcrypto', 'pgcrypto is installed');
select has_extension('citext', 'citext is installed');
select has_table('public', 'schema_migrations', 'the migration runner has recorded itself');
select * from finish();
