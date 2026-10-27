-- A shopper reads only the products their own receipt lines point to, so nobody can list everything
-- other people bought. The server still sees all of them for matching.
create index receipt_items_maybe_product on public.receipt_items (user_id, maybe_product_id) where maybe_product_id is not null;

drop policy "products are readable by signed-in people" on public.products;
create policy "products on own receipts" on public.products for select to authenticated using (
	exists (select 1 from public.receipt_items i where i.user_id = (select auth.uid()) and i.product_id = products.id)
	or exists (select 1 from public.receipt_items i where i.user_id = (select auth.uid()) and i.maybe_product_id = products.id)
);
