select plan(5);
select has_extension('pgcrypto', 'pgcrypto is installed');
select has_table('public', 'schema_migrations', 'the migration runner has recorded itself');
select has_role('eyeq_owner'); select has_role('eyeq_api'); select has_role('eyeq_service');
select * from finish();
