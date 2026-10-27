-- Healthy picks a shopper saved to look at when they next go shopping.
alter table public.user_settings
	add column healthy_saved text[] not null default '{}' check (cardinality(healthy_saved) <= 60);
