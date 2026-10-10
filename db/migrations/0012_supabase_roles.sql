-- Supabase: the migration user (postgres) is not a superuser there. Creating a role
-- gives it ADMIN on that role but not SET, so it cannot SET ROLE eyeq_api or
-- eyeq_service (the RLS tests do, and a pooled admin connection may per request).
-- Grant SET only; INHERIT stays off so postgres gains none of their privileges.
-- On a superuser (local compose, CI) this is a harmless no-op in effect.
grant eyeq_api to current_user with inherit false, set true;
grant eyeq_service to current_user with inherit false, set true;
