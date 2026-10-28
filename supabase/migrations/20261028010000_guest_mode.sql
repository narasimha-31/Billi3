-- Guests try the app without signing in. Only the server marks an account as a guest (app metadata),
-- guests spend from their own pool, and the pool shoppers read from never pays for them.
create function public.is_guest(p_user_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((select raw_app_meta_data->>'guest' = 'true' from auth.users where id = p_user_id), false);
$$;

revoke execute on function public.is_guest(uuid) from public, anon, authenticated;

-- a guest gets the full 10 on day one, as judges try it the day the account is made
create or replace function public.daily_receipt_limit(p_user_id uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when raw_app_meta_data->>'guest' = 'true' then 10
		when created_at > now() - interval '1 day' then 3
		else 10 end
	from auth.users
	where id = p_user_id;
$$;

revoke execute on function public.daily_receipt_limit(uuid) from public, anon, authenticated;

-- the sample receipts a guest starts with are saved by the server, so they are no uploads
create or replace function public.enforce_receipt_limits() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	last_minute integer;
	last_day integer;
	last_month integer;
begin
	if auth.role() is distinct from 'service_role' then
		new.created_at := now();
	elsif new.status = 'saved' then
		return new;
	end if;

	select
		count(*) filter (where created_at > now() - interval '1 minute'),
		count(*) filter (where created_at > now() - interval '1 day' and not given_back),
		count(*) filter (where created_at > now() - interval '30 days')
	into last_minute, last_day, last_month
	from public.upload_log
	where user_id = new.user_id;

	if last_minute >= 5 then
		raise exception 'receipt limit: too many at once' using errcode = 'P0001';
	elsif last_day >= coalesce(public.daily_receipt_limit(new.user_id), 10) then
		raise exception 'receipt limit: daily' using errcode = 'P0001';
	elsif last_month >= 100 then
		raise exception 'receipt limit: monthly' using errcode = 'P0001';
	end if;

	insert into public.upload_log (user_id, created_at, receipt_id) values (new.user_id, new.created_at, new.id);
	return new;
end;
$$;

revoke execute on function public.enforce_receipt_limits() from public, anon, authenticated;

-- Today's spend split three ways: shoppers (with their new accounts' share), guests, and this person.
-- ever_micros is everything spent on the credits so far, evals included, so guests stop before they run out.
drop function public.ai_spent_today(uuid);

create function public.ai_spent_today(p_user_id uuid) returns table (all_micros bigint, user_micros bigint, new_micros bigint, user_is_new boolean, guest_micros bigint, user_is_guest boolean, ever_micros bigint)
language sql
stable
security definer
set search_path = ''
as $$
	with today as (
		select c.cost_micros, c.user_id, u.created_at as joined, coalesce(u.raw_app_meta_data->>'guest' = 'true', false) as guest
		from public.ai_calls c
		left join auth.users u on u.id = c.user_id
		where c.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
			and c.purpose not like 'eval\_%'
	)
	select
		coalesce(sum(cost_micros) filter (where not guest), 0)::bigint,
		coalesce(sum(cost_micros) filter (where user_id = p_user_id), 0)::bigint,
		coalesce(sum(cost_micros) filter (where not guest and joined > now() - interval '3 days'), 0)::bigint,
		coalesce((select created_at > now() - interval '3 days' from auth.users where id = p_user_id), false),
		coalesce(sum(cost_micros) filter (where guest), 0)::bigint,
		public.is_guest(p_user_id),
		(select coalesce(sum(cost_micros), 0)::bigint from public.ai_calls)
	from today;
$$;

revoke execute on function public.ai_spent_today(uuid) from public, anon, authenticated;
grant execute on function public.ai_spent_today(uuid) to service_role;

-- web searches guests set off today, all of them together
create function public.guest_searches_today() returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)
	from public.ai_calls c
	join auth.users u on u.id = c.user_id
	where c.model = 'tavily/search'
		and u.raw_app_meta_data->>'guest' = 'true'
		and c.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;

revoke execute on function public.guest_searches_today() from public, anon, authenticated;
grant execute on function public.guest_searches_today() to service_role;

-- guest sessions started per network, kept as a salted hash of the address, never the address
create table public.guest_starts (
	id bigint generated always as identity primary key,
	network text not null,
	created_at timestamptz not null default now()
);

create index guest_starts_network on public.guest_starts (network, created_at);
alter table public.guest_starts enable row level security;
revoke all on public.guest_starts from public, anon, authenticated;

-- guests over three hours old, for the server to delete with their photos
create function public.old_guests() returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	select id from auth.users
	where raw_app_meta_data->>'guest' = 'true' and created_at < now() - interval '3 hours'
	limit 50;
$$;

revoke execute on function public.old_guests() from public, anon, authenticated;
grant execute on function public.old_guests() to service_role;
grant execute on function public.is_guest(uuid) to service_role;

-- which model read the receipt, shown on it so people see what ran
alter table public.receipts add column read_by text;
