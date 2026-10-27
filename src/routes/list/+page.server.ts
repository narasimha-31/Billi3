import { fail, redirect } from '@sveltejs/kit';
import { compareStores, listName, listTitle, spentOn, type ListPrice } from '../../list-compare';
import { firstNameOf } from '../../session.server';
import { placed } from '../../branches';
import { mapState, myBranches } from '../../store-map.server';
import type { Actions, PageServerLoad } from './$types';

const MOST_ITEMS = 60;
const MOST_LISTS = 10;
const UUID = /^[0-9a-f-]{36}$/;

type List = { id: string; name: string; items: string[] };
type SavedFood = { name: string; why: string | null; category: string | null; allergens: string[]; source_url: string | null; source: string | null };
type One<T> = T | T[] | null;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = await locals.getUser();
	if (!user) redirect(303, '/');

	const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
	const [lists, products, branches, map, month, settings] = await Promise.all([
		locals.supabase.from('shopping_lists').select('id, name, items').order('created_at'),
		locals.supabase.rpc('my_products'),
		myBranches(locals.supabase),
		mapState(locals.supabase),
		locals.supabase
			.from('receipt_items')
			.select('name, total_cents, products!product_id(name), receipts!inner(purchased_on, status)')
			.eq('kind', 'item')
			.eq('receipts.status', 'saved')
			.gte('receipts.purchased_on', monthStart),
		locals.supabase.from('user_settings').select('healthy_saved').maybeSingle()
	]);
	for (const answer of [lists, products, month, settings]) if (answer.error) throw answer.error;

	// saved healthy picks with why and where it was read; the shared list is small, so all of it
	const savedNames = (settings.data?.healthy_saved as string[] | undefined) ?? [];
	const foods = savedNames.length ? await locals.supabase.from('healthy_foods').select('name, why, category, allergens, source_url, source') : { data: [], error: null };
	if (foods.error) throw foods.error;
	const foodOf = new Map((foods.data as SavedFood[]).map((f) => [f.name, f]));

	const all = (lists.data ?? []) as List[];
	// every list's items priced in one call
	const wanted = [...new Set(all.flatMap((l) => l.items))];
	const prices = wanted.length ? await locals.supabase.rpc('my_list_prices', { names: wanted }) : { data: [], error: null };
	if (prices.error) throw prices.error;
	const rows = prices.data as ListPrice[];

	const lines = (month.data ?? []).map((l) => {
		const product = l.products as One<{ name: string }>;
		return { name: (Array.isArray(product) ? product[0]?.name : product?.name) ?? l.name ?? '', cents: l.total_cents as number };
	});
	const asked = url.searchParams.get('open');
	const open = all.find((l) => l.id === asked) ?? null;

	return {
		firstName: firstNameOf(user),
		products: (products.data as { name: string; times: number; last_bought: string | null; category: string | null }[]).map(({ name, times, last_bought, category }) => ({ name, times: Number(times), last_bought, category })),
		lists: all.map((list) => {
			const { stores } = compareStores(list.items, rows);
			return { id: list.id, name: list.name, count: list.items.length, best: stores[0] ?? null, spentCents: spentOn(list.items, lines) };
		}),
		open: open ? { id: open.id, name: open.name, list: open.items, ...compareStores(open.items, rows) } : null,
		saved: savedNames.map((name) => foodOf.get(name) ?? { name, why: null, category: null, allergens: [], source_url: null, source: null }),
		you: map.you,
		places: map.you ? placed(branches, map.you) : []
	};
};

// row level security limits every read and write here to the shopper's own lists
async function listOf(locals: App.Locals, form: FormData) {
	const id = String(form.get('list') ?? '');
	if (!UUID.test(id)) return null;
	const { data, error } = await locals.supabase.from('shopping_lists').select('id, name, items').eq('id', id).maybeSingle();
	if (error) throw error;
	return data as List | null;
}

async function saveItems(locals: App.Locals, id: string, items: string[]) {
	const { error } = await locals.supabase.from('shopping_lists').update({ items, updated_at: new Date().toISOString() }).eq('id', id);
	if (error) throw error;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const name = listTitle((await request.formData()).get('title'));
		if (!name) return fail(400, { problem: 'Name the list, up to 30 letters.' });
		const { count, error: counted } = await locals.supabase.from('shopping_lists').select('id', { count: 'exact', head: true });
		if (counted) throw counted;
		if ((count ?? 0) >= MOST_LISTS) return fail(400, { problem: `You can keep up to ${MOST_LISTS} lists.` });
		const { data, error } = await locals.supabase.from('shopping_lists').insert({ user_id: user.id, name }).select('id').single();
		if (error?.code === 'P0001') return fail(400, { problem: `You can keep up to ${MOST_LISTS} lists.` });
		if (error) throw error;
		redirect(303, `/list?open=${data.id}`);
	},

	rename: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const form = await request.formData();
		const list = await listOf(locals, form);
		if (!list) return fail(404, { problem: 'That list is gone.' });
		const name = listTitle(form.get('title'));
		if (!name) return fail(400, { problem: 'Name the list, up to 30 letters.' });
		const { error } = await locals.supabase.from('shopping_lists').update({ name, updated_at: new Date().toISOString() }).eq('id', list.id);
		if (error) throw error;
	},

	delete: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const list = await listOf(locals, await request.formData());
		if (!list) return fail(404, { problem: 'That list is gone.' });
		const { error } = await locals.supabase.from('shopping_lists').delete().eq('id', list.id);
		if (error) throw error;
		redirect(303, '/list');
	},

	add: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const form = await request.formData();
		const list = await listOf(locals, form);
		if (!list) return fail(404, { problem: 'That list is gone.' });
		const typed = listName(form.get('name'));
		if (!typed) return fail(400, { problem: 'Type an item, up to 60 letters.' });
		const products = await locals.supabase.rpc('my_products');
		if (products.error) throw products.error;
		// "whole milk" becomes the product's own "Whole milk"
		const name = (products.data as { name: string }[]).find((p) => same(p.name, typed))?.name ?? typed;
		if (list.items.some((item) => same(item, name))) return;
		if (list.items.length >= MOST_ITEMS) return fail(400, { problem: `A list holds up to ${MOST_ITEMS} items.` });
		await saveItems(locals, list.id, [...list.items, name]);
	},

	remove: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const form = await request.formData();
		const list = await listOf(locals, form);
		if (!list) return fail(404, { problem: 'That list is gone.' });
		const name = String(form.get('name') ?? '');
		await saveItems(locals, list.id, list.items.filter((item) => !same(item, name)));
	},

	unsave: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const name = String((await request.formData()).get('name') ?? '');
		const { data, error } = await locals.supabase.from('user_settings').select('healthy_saved').maybeSingle();
		if (error) throw error;
		const left = ((data?.healthy_saved as string[] | undefined) ?? []).filter((s) => s !== name);
		const stored = await locals.supabase.from('user_settings').upsert({ user_id: user.id, healthy_saved: left, updated_at: new Date().toISOString() });
		if (stored.error) throw stored.error;
	},

	clear: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });
		const list = await listOf(locals, await request.formData());
		if (!list) return fail(404, { problem: 'That list is gone.' });
		await saveItems(locals, list.id, []);
	}
};
