-- Phase 0: extensions every later migration may rely on.
-- pg_cron is created in phase 6 (it needs cron.database_name on the server);
-- pgtap is created by the test runner only, never here.
create extension if not exists pgcrypto;
create extension if not exists citext;
