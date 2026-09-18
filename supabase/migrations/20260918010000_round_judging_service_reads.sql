-- The server-side judging route reads only round metadata and submission paths.
-- RLS bypass does not replace PostgreSQL table privileges for service_role.
grant select on table public.rounds to service_role;
grant select on table public.round_submissions to service_role;
