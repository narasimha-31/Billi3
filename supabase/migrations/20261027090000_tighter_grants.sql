-- Shoppers never need to empty a table, add triggers or reference rows, so those rights go.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke execute on function public.enforce_receipt_limits() from public, anon, authenticated;
