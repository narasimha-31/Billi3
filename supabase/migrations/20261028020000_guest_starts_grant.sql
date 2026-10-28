-- only the server counts guest sessions
grant select, insert, delete on public.guest_starts to service_role;
