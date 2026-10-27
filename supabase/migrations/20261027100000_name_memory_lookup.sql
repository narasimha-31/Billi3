-- Receipt lines can look like SQL; sent as a URL filter, the host's firewall blocks the request.
-- As a function call they travel in the body. Runs as the caller, so row security still applies.
create function public.my_name_memory(p_raws text[], p_store uuid)
returns table (raw_text text, name text, brand text, category text, size_amount numeric, size_unit text)
language sql stable security invoker set search_path = ''
as $$
	select m.raw_text, m.name, m.brand, m.category, m.size_amount, m.size_unit
	from public.name_memory m
	where m.user_id = (select auth.uid())
		and m.raw_text = any(p_raws)
		and m.store_id is not distinct from p_store;
$$;
revoke execute on function public.my_name_memory(text[], uuid) from public, anon;
grant execute on function public.my_name_memory(text[], uuid) to authenticated;
