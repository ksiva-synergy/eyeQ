-- Loaded as the admin role. Tests run as eyeq_owner, which has no access to the cron
-- schema (pg_cron's own); this copies the schedules into a temp table it can read.
create temp table cron_jobs on commit drop as select jobname, schedule, command from cron.job;
grant select on cron_jobs to eyeq_owner;
