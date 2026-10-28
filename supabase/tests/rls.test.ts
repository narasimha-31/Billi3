import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chooseAisle, myAisles } from '../../src/aisle-choice.server';

const url = process.env.PUBLIC_SUPABASE_URL!;
const publishable = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, noSession);
const userIds: string[] = [];

// A brand-new account may add only 3 receipts on its first day. Most tests need more, so their
// accounts are made as guests, which the database gives the full 10; row security is the same for both.
async function signedInUser(label: string, firstDay = false): Promise<SupabaseClient> {
	const email = `rls-${label}-${crypto.randomUUID()}@billi.test`;
	const created = await admin.auth.admin.createUser({ email, email_confirm: true, ...(!firstDay && { app_metadata: { guest: true } }) });
	if (created.error) throw created.error;
	userIds.push(created.data.user.id);

	const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
	if (link.error) throw link.error;

	const client = createClient(url, publishable, noSession);
	const verified = await client.auth.verifyOtp({
		type: 'email',
		token_hash: link.data.properties.hashed_token
	});
	if (verified.error) throw verified.error;
	return client;
}

let alice: SupabaseClient;
let bob: SupabaseClient;
let aliceId: string;
let aliceStoreId: string;
let aliceReceiptId: string;

beforeAll(async () => {
	alice = await signedInUser('alice');
	bob = await signedInUser('bob');
	aliceId = userIds[0];

	const store = await alice.from('stores').insert({ name: 'Fiesta' }).select().single();
	if (store.error) throw store.error;
	aliceStoreId = store.data.id;

	const receipt = await alice
		.from('receipts')
		.insert({ store_id: aliceStoreId, total_cents: 1299 })
		.select()
		.single();
	if (receipt.error) throw receipt.error;
	aliceReceiptId = receipt.data.id;
});

afterAll(async () => {
	for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

async function aliceReceiptAsAdmin() {
	const { data, error } = await admin.from('receipts').select().eq('id', aliceReceiptId).single();
	if (error) throw error;
	return data;
}

describe('row level security on receipts and stores', () => {
	it('lets the owner read their receipt', async () => {
		const { data, error } = await alice.from('receipts').select().eq('id', aliceReceiptId);
		expect(error).toBeNull();
		expect(data).toHaveLength(1);
	});

	it("hides another user's receipts and stores", async () => {
		const receipts = await bob.from('receipts').select();
		const stores = await bob.from('stores').select();
		expect(receipts.data).toEqual([]);
		expect(stores.data).toEqual([]);
	});

	it("blocks editing another user's receipt", async () => {
		await bob.from('receipts').update({ total_cents: 1 }).eq('id', aliceReceiptId);
		expect((await aliceReceiptAsAdmin()).total_cents).toBe(1299);
	});

	it("blocks deleting another user's receipt", async () => {
		await bob.from('receipts').delete().eq('id', aliceReceiptId);
		expect((await aliceReceiptAsAdmin()).id).toBe(aliceReceiptId);
	});

	it('blocks inserting a receipt as someone else', async () => {
		const { error } = await bob.from('receipts').insert({ user_id: aliceId, total_cents: 5 });
		expect(error?.code).toBe('42501');
	});

	it("blocks attaching a receipt to another user's store", async () => {
		const { error } = await bob.from('receipts').insert({ store_id: aliceStoreId, total_cents: 5 });
		expect(error?.code).toBe('23503');
	});

	it('blocks moving your receipt onto another user', async () => {
		const own = await bob.from('receipts').insert({ total_cents: 7 }).select().single();
		expect(own.error).toBeNull();
		const { error } = await bob.from('receipts').update({ user_id: aliceId }).eq('id', own.data!.id);
		expect(error?.code).toBe('42501');
	});

	it('gives signed-out visitors nothing', async () => {
		const anon = createClient(url, publishable, noSession);
		const receipts = await anon.from('receipts').select();
		const stores = await anon.from('stores').select();
		expect(receipts.error?.code).toBe('42501');
		expect(stores.error?.code).toBe('42501');
	});
});

describe('row level security on items, name memory and settings', () => {
	const hash = (c: string) => c.repeat(64);
	let aliceItemId: string;

	beforeAll(async () => {
		const item = await alice
			.from('receipt_items')
			.insert({ receipt_id: aliceReceiptId, position: 0, raw_text: 'GRN CHILI HOT', total_cents: 126 })
			.select()
			.single();
		if (item.error) throw item.error;
		aliceItemId = item.data.id;
	});

	it("hides another user's items, name memory and settings", async () => {
		await alice.from('name_memory').insert({ store_id: aliceStoreId, raw_text: 'GRN CHILI HOT', name: 'Green chillies' });
		await alice.from('user_settings').insert({ keep_store_name: true });
		for (const table of ['receipt_items', 'name_memory', 'user_settings']) {
			const { data } = await bob.from(table).select();
			expect(data, table).toEqual([]);
		}
	});

	it("blocks adding an item to another user's receipt", async () => {
		const { error } = await bob
			.from('receipt_items')
			.insert({ receipt_id: aliceReceiptId, position: 9, raw_text: 'X', total_cents: 1 });
		expect(error?.code).toBe('23503');
	});

	it("blocks editing another user's item", async () => {
		await bob.from('receipt_items').update({ total_cents: 1 }).eq('id', aliceItemId);
		const { data } = await admin.from('receipt_items').select().eq('id', aliceItemId).single();
		expect(data?.total_cents).toBe(126);
	});

	it("blocks saving name memory against another user's store", async () => {
		const { error } = await bob
			.from('name_memory')
			.insert({ store_id: aliceStoreId, raw_text: 'X', name: 'Y' });
		expect(error?.code).toBe('23503');
	});

	it('blocks writing settings for someone else', async () => {
		const { error } = await bob.from('user_settings').insert({ user_id: aliceId, keep_photos: true });
		expect(error?.code).toBe('42501');
	});

	it('only lets discount lines be negative', async () => {
		const discount = await alice
			.from('receipt_items')
			.insert({ receipt_id: aliceReceiptId, position: 1, kind: 'discount', raw_text: 'SAVINGS', total_cents: -50 });
		const item = await alice
			.from('receipt_items')
			.insert({ receipt_id: aliceReceiptId, position: 2, raw_text: 'EGGS', total_cents: -50 });
		expect(discount.error).toBeNull();
		expect(item.error?.code).toBe('23514');
	});

	it('rejects the same photo twice for one user but not across users', async () => {
		const first = await alice.from('receipts').insert({ image_hash: hash('a') });
		const again = await alice.from('receipts').insert({ image_hash: hash('a') });
		const otherUser = await bob.from('receipts').insert({ image_hash: hash('a') });
		expect(first.error).toBeNull();
		expect(again.error?.code).toBe('23505');
		expect(otherUser.error).toBeNull();
	});

	it('keeps store names by default, starts the other options off, and validates the zip code', async () => {
		const fresh = await bob.from('user_settings').insert({}).select().single();
		expect(fresh.data).toMatchObject({ keep_store_name: true, keep_store_location: false, keep_photos: false });
		const badZip = await bob.from('user_settings').update({ zip_code: '1234' }).eq('user_id', fresh.data!.user_id);
		expect(badZip.error?.code).toBe('23514');
	});

	it('gives signed-out visitors nothing from the new tables', async () => {
		const anon = createClient(url, publishable, noSession);
		for (const table of ['receipt_items', 'name_memory', 'user_settings']) {
			const { error } = await anon.from(table).select();
			expect(error?.code, table).toBe('42501');
		}
	});
});

describe('receipt photo storage', () => {
	// smallest valid jpeg (1x1)
	const jpeg = Buffer.from(
		'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
		'base64'
	);
	const bucket = 'receipts';
	let alicePath: string;
	const exists = async (path: string) => {
		const folder = path.split('/')[0];
		const { data } = await admin.storage.from(bucket).list(folder);
		return (data ?? []).some((f) => `${folder}/${f.name}` === path);
	};

	// a photo is only accepted for a receipt of yours that is waiting for it, like the app makes
	const awaiting = async (client: SupabaseClient, path: string) => {
		const { error } = await client.from('receipts').insert({ image_path: path });
		if (error) throw error;
	};

	beforeAll(async () => {
		alicePath = `${aliceId}/${crypto.randomUUID()}.jpg`;
		await awaiting(alice, alicePath);
		const { error } = await alice.storage.from(bucket).upload(alicePath, jpeg, { contentType: 'image/jpeg' });
		if (error) throw error;
	});

	afterAll(async () => {
		for (const id of userIds) {
			const { data } = await admin.storage.from(bucket).list(id);
			if (data?.length) await admin.storage.from(bucket).remove(data.map((f) => `${id}/${f.name}`));
		}
	});

	it('lets the owner read their own photo', async () => {
		const { data, error } = await alice.storage.from(bucket).download(alicePath);
		expect(error).toBeNull();
		expect(data?.size).toBe(jpeg.length);
	});

	it("hides another user's photo", async () => {
		const { data } = await bob.storage.from(bucket).download(alicePath);
		expect(data).toBeNull();
		const listing = await bob.storage.from(bucket).list(aliceId);
		expect(listing.data ?? []).toEqual([]);
	});

	it("blocks uploading into another user's folder, even with a receipt pointing there", async () => {
		const path = `${aliceId}/planted.jpg`;
		await awaiting(bob, path);
		const { error } = await bob.storage.from(bucket).upload(path, jpeg, { contentType: 'image/jpeg' });
		expect(error).not.toBeNull();
		expect(await exists(path)).toBe(false);
	});

	it("blocks deleting another user's photo", async () => {
		await bob.storage.from(bucket).remove([alicePath]);
		expect(await exists(alicePath)).toBe(true);
	});

	it('never lets a photo be swapped out after upload', async () => {
		const { error } = await alice.storage.from(bucket).upload(alicePath, jpeg, { contentType: 'image/jpeg', upsert: true });
		expect(error).not.toBeNull();
	});

	it('only accepts jpeg', async () => {
		const path = `${aliceId}/${crypto.randomUUID()}.png`;
		await awaiting(alice, path);
		const { error } = await alice.storage.from(bucket).upload(path, jpeg, { contentType: 'image/png' });
		expect(error).not.toBeNull();
		expect(await exists(path)).toBe(false);
	});

	it('rejects photos over 5 MB', async () => {
		const path = `${aliceId}/${crypto.randomUUID()}.jpg`;
		await awaiting(alice, path);
		const big = Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)]);
		const { error } = await alice.storage.from(bucket).upload(path, big, { contentType: 'image/jpeg' });
		expect(error).not.toBeNull();
		expect(await exists(path)).toBe(false);
	});

	it('refuses a photo with no receipt waiting for it', async () => {
		const path = `${aliceId}/${crypto.randomUUID()}.jpg`;
		const { error } = await alice.storage.from(bucket).upload(path, jpeg, { contentType: 'image/jpeg' });
		expect(error).not.toBeNull();
		expect(await exists(path)).toBe(false);
	});

	it('refuses a photo for a receipt that was already read or is too old', async () => {
		const read = `${aliceId}/${crypto.randomUUID()}.jpg`;
		const old = `${aliceId}/${crypto.randomUUID()}.jpg`;
		await admin.from('receipts').insert([
			{ user_id: aliceId, image_path: read, status: 'saved' },
			{ user_id: aliceId, image_path: old, created_at: new Date(Date.now() - 11 * 60_000).toISOString() }
		]);
		for (const path of [read, old]) {
			const { error } = await alice.storage.from(bucket).upload(path, jpeg, { contentType: 'image/jpeg' });
			expect(error, path).not.toBeNull();
			expect(await exists(path)).toBe(false);
		}
	});

	it('gives signed-out visitors nothing, not even through a public link', async () => {
		const anon = createClient(url, publishable, noSession);
		const { data } = await anon.storage.from(bucket).download(alicePath);
		expect(data).toBeNull();
		const publicUrl = anon.storage.from(bucket).getPublicUrl(alicePath).data.publicUrl;
		expect((await fetch(publicUrl)).ok).toBe(false);
	});
});

describe('receipt and upload limits, enforced by the database', () => {
	const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

	async function userWithHistory(label: string, count: number, minutesBack: number) {
		const client = await signedInUser(label);
		const id = userIds[userIds.length - 1];
		if (count) {
			const rows = Array.from({ length: count }, () => ({ user_id: id, created_at: minutesAgo(minutesBack) }));
			const { error } = await admin.from('receipts').insert(rows);
			if (error) throw error;
		}
		return client;
	}

	it('gives a brand-new account 3 receipts on its first day', async () => {
		const fresh = await signedInUser('fresh', true);
		for (let i = 0; i < 3; i++) expect((await fresh.from('receipts').insert({})).error).toBeNull();
		expect((await fresh.from('receipts').insert({})).error?.message).toContain('receipt limit: daily');
		expect((await fresh.rpc('my_upload_window')).data[0].daily_limit).toBe(3);
	});

	it('refuses a burst of more than 5 receipts in a minute', async () => {
		const carol = await userWithHistory('carol', 0, 0);
		for (let i = 0; i < 5; i++) {
			const { error } = await carol.from('receipts').insert({});
			expect(error).toBeNull();
		}
		const { error } = await carol.from('receipts').insert({});
		expect(error?.message).toBe('receipt limit: too many at once');
	});

	it('refuses the 11th receipt in a day', async () => {
		const dave = await userWithHistory('dave', 10, 5);
		const { error } = await dave.from('receipts').insert({});
		expect(error?.message).toBe('receipt limit: daily');
	});

	it('refuses the 101st receipt in 30 days', async () => {
		const erin = await userWithHistory('erin', 100, 2 * 24 * 60);
		const { error } = await erin.from('receipts').insert({});
		expect(error?.message).toBe('receipt limit: monthly');
	});

	it('ignores a backdated timestamp sent by the client', async () => {
		const frank = await userWithHistory('frank', 0, 0);
		const { data } = await frank.from('receipts').insert({ created_at: '2020-01-01T00:00:00Z' }).select().single();
		expect(Date.now() - new Date(data!.created_at).getTime()).toBeLessThan(60_000);
	});

	it('does not hand back a slot when receipts are deleted', async () => {
		const gina = await userWithHistory('gina', 9, 5);
		const id = userIds[userIds.length - 1];
		const last = await gina.from('receipts').insert({}).select('id').single();
		expect(last.error).toBeNull();
		const deleted = await gina.from('receipts').delete().eq('user_id', id).select('id');
		expect(deleted.data).toHaveLength(10);
		const { error } = await gina.from('receipts').insert({});
		expect(error?.message).toBe('receipt limit: daily');
	});

	it('tells people their own upload count, deleted receipts included, and nobody else', async () => {
		const ivy = await userWithHistory('ivy', 3, 5);
		const id = userIds[userIds.length - 1];
		await admin.from('receipts').delete().eq('user_id', id);
		expect((await ivy.rpc('uploads_today')).data).toBe(3);
		const anon = createClient(url, publishable, noSession);
		expect((await anon.rpc('uploads_today')).error).not.toBeNull();
	});

	it('says how many of the last 24 hours of uploads are used and when the oldest drops out', async () => {
		const jo = await userWithHistory('jo', 2, 5);
		const { data } = await jo.rpc('my_upload_window');
		expect(data[0].used).toBe(2);
		const frees = Date.parse(data[0].frees_at);
		expect(frees).toBeGreaterThan(Date.now() + 23 * 3600_000);
		expect(frees).toBeLessThanOrEqual(Date.now() + 24 * 3600_000);
		const empty = await userWithHistory('kit', 0, 0);
		expect((await empty.rpc('my_upload_window')).data).toEqual([{ used: 0, frees_at: null, daily_limit: 10 }]);
		const anon = createClient(url, publishable, noSession);
		expect((await anon.rpc('my_upload_window')).error).not.toBeNull();
	});

	it('keeps the upload log out of reach of users and visitors', async () => {
		const henry = await userWithHistory('henry', 1, 5);
		const id = userIds[userIds.length - 1];
		const anon = createClient(url, publishable, noSession);
		for (const client of [henry, anon]) {
			const { data } = await client.from('upload_log').select();
			expect(data ?? []).toEqual([]);
			const removed = await client.from('upload_log').delete().eq('user_id', id).select();
			expect(removed.data ?? []).toEqual([]);
			const forged = await client.from('upload_log').insert({ user_id: id, created_at: '2020-01-01T00:00:00Z' });
			expect(forged.error).not.toBeNull();
		}
		const { count } = await admin.from('upload_log').select('*', { count: 'exact', head: true }).eq('user_id', id);
		expect(count).toBe(1);
	});
});

describe('photo counting function', () => {
	it('only ever reports the caller their own upload count', async () => {
		// a fresh person: earlier tests used up the others' per-minute receipt limit
		const pat = await signedInUser('pat');
		const path = `${userIds[userIds.length - 1]}/${crypto.randomUUID()}.jpg`;
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
		const waiting = await pat.from('receipts').insert({ image_path: path });
		expect(waiting.error).toBeNull();
		const uploaded = await pat.storage.from('receipts').upload(path, jpeg, { contentType: 'image/jpeg' });
		expect(uploaded.error).toBeNull();

		const { data: patCount } = await pat.rpc('receipt_photos_today');
		const { data: bobCount } = await bob.rpc('receipt_photos_today');
		await admin.storage.from('receipts').remove([path]);
		expect(patCount).toBe(1);
		expect(bobCount).toBe(0);
	});

	it('cannot be called by signed-out visitors', async () => {
		const anon = createClient(url, publishable, noSession);
		const { error } = await anon.rpc('receipt_photos_today');
		expect(error).not.toBeNull();
	});
});

describe('phone links', () => {
	const hex = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
	const later = () => new Date(Date.now() + 600_000).toISOString();

	async function link(over: Record<string, unknown> = {}) {
		const row = { token_hash: hex(), claim_hash: hex(), user_id: aliceId, expires_at: later(), ...over };
		await admin.from('phone_links').delete().eq('user_id', aliceId);
		const { error } = await admin.from('phone_links').insert(row);
		if (error) throw error;
		return row as { token_hash: string; claim_hash: string };
	}

	it('are invisible to users and visitors, even their own', async () => {
		const own = await link();
		const anon = createClient(url, publishable, noSession);
		for (const client of [alice, bob, anon]) {
			const { data } = await client.from('phone_links').select();
			expect(data ?? []).toEqual([]);
			const insert = await client.from('phone_links').insert({ token_hash: hex(), user_id: aliceId, expires_at: later() });
			expect(insert.error).not.toBeNull();
			const used = await client.rpc('use_phone_link', { p_token_hash: own.token_hash, p_claim_hash: own.claim_hash });
			expect(used.error).not.toBeNull();
		}
	});

	it('count an upload only for the phone that claimed the link', async () => {
		const own = await link();
		const right = await admin.rpc('use_phone_link', { p_token_hash: own.token_hash, p_claim_hash: own.claim_hash });
		const wrong = await admin.rpc('use_phone_link', { p_token_hash: own.token_hash, p_claim_hash: hex() });
		expect(right.data).toBe(aliceId);
		expect(wrong.data).toBeNull();
	});

	it('stop working once expired or after 10 photos', async () => {
		const expired = await link({ expires_at: new Date(Date.now() - 60_000).toISOString() });
		expect((await admin.rpc('use_phone_link', { p_token_hash: expired.token_hash, p_claim_hash: expired.claim_hash })).data).toBeNull();

		const full = await link({ uploads: 9 });
		expect((await admin.rpc('use_phone_link', { p_token_hash: full.token_hash, p_claim_hash: full.claim_hash })).data).toBe(aliceId);
		expect((await admin.rpc('use_phone_link', { p_token_hash: full.token_hash, p_claim_hash: full.claim_hash })).data).toBeNull();
	});

	it('allow one link per account', async () => {
		await link();
		const second = await admin.from('phone_links').insert({ token_hash: hex(), user_id: aliceId, expires_at: later() });
		expect(second.error?.code).toBe('23505');
	});
});

describe('product grouping', () => {
	it('lists each of the caller\'s products once, with how often and how many stores, and nobody else\'s', async () => {
		const zoe = await signedInUser('zoe');
		const zoeId = userIds[userIds.length - 1];
		const store = async (name: string) => (await admin.from('stores').insert({ user_id: zoeId, name }).select('id').single()).data!.id as string;
		const [fiesta, heb] = [await store('Fiesta'), await store('H-E-B')];
		const receipt = async (storeId: string, day: string) =>
			(await admin.from('receipts').insert({ user_id: zoeId, store_id: storeId, purchased_on: day, created_at: '2026-09-01T00:00:00Z' }).select('id').single()).data!.id as string;
		const item = (receiptId: string, position: number, name: string) => ({
			user_id: zoeId, receipt_id: receiptId, position, kind: 'item', raw_text: name.toUpperCase(), name, brand: null, category: 'Dairy & eggs',
			quantity: 1, unit: 'ea', unit_price_cents: null, total_cents: 199, computed: false, issue: null, size_amount: null, size_unit: null
		});
		const a = await receipt(fiesta, '2026-10-02');
		const b = await receipt(heb, '2026-09-20');
		const { error } = await admin.from('receipt_items').insert([item(a, 0, 'Whole milk'), item(a, 1, 'Limes'), item(b, 0, 'Whole milk')]);
		if (error) throw error;

		const { data } = await zoe.rpc('my_products');
		expect(data).toEqual([
			{ name: 'Whole milk', times: 2, last_bought: '2026-10-02', stores: 2, category: 'Dairy & eggs', maybe_same: null },
			{ name: 'Limes', times: 1, last_bought: '2026-10-02', stores: 1, category: 'Dairy & eggs', maybe_same: null }
		]);
		const others = await bob.rpc('my_products');
		expect((others.data ?? []).some((p: { name: string }) => p.name === 'Limes')).toBe(false);
		const anon = createClient(url, publishable, noSession);
		expect((await anon.rpc('my_products')).error).not.toBeNull();
	});

	it('counts differently named lines of one shared product as that product, and says what a line might be', async () => {
		const ann = await signedInUser('ann');
		const annId = userIds[userIds.length - 1];
		const tag = crypto.randomUUID().slice(0, 8);
		const vector = `[${Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
		const made = await admin.from('products').insert([
			{ name: `Roma tomatoes ${tag}`, match_key: `roma tomato ${tag}`, embedding: vector },
			{ name: `Plum tomatoes ${tag}`, match_key: `plum tomato ${tag}`, embedding: vector }
		]).select('id, name');
		if (made.error) throw made.error;
		const [roma, plum] = made.data!;
		try {
			const store = (await admin.from('stores').insert({ user_id: annId, name: 'Parivar' }).select('id').single()).data!.id;
			const receipt = (await admin.from('receipts').insert({ user_id: annId, store_id: store, purchased_on: '2026-09-19', created_at: '2026-09-01T00:00:00Z' }).select('id').single()).data!.id;
			const line = (position: number, name: string, productId: string | null, maybeId: string | null = null) => ({
				user_id: annId, receipt_id: receipt, position, kind: 'item', raw_text: name.toUpperCase(), name, category: 'Produce',
				quantity: 1, unit: 'ea', total_cents: 100, computed: false, product_id: productId, maybe_product_id: maybeId
			});
			const { error } = await admin.from('receipt_items').insert([line(0, 'Tomatoes', roma.id), line(1, 'Roma tomatoes', roma.id), line(2, 'Plum tomato', plum.id, roma.id)]);
			if (error) throw error;

			const { data } = await ann.rpc('my_products');
			expect(data.map((p: { name: string; times: number; maybe_same: string | null }) => [p.name, p.times, p.maybe_same])).toEqual([
				[roma.name, 2, null],
				[plum.name, 1, roma.name]
			]);
		} finally {
			await admin.from('products').delete().in('id', [roma.id, plum.id]);
		}
	});
});

describe('price changes', () => {
	it('compares the last two purchases of each product, per pound or each, biggest move first', async () => {
		const yan = await signedInUser('yan');
		const yanId = userIds[userIds.length - 1];
		const store = async (name: string) => (await admin.from('stores').insert({ user_id: yanId, name }).select('id').single()).data!.id as string;
		const [fiesta, parivar] = [await store('Fiesta'), await store('Parivar')];
		const receipt = async (storeId: string, day: string | null) =>
			(await admin.from('receipts').insert({ user_id: yanId, store_id: storeId, purchased_on: day }).select('id').single()).data!.id as string;
		const item = (receiptId: string, position: number, name: string, unit: string, quantity: number, unitCents: number | null, totalCents: number) => ({
			user_id: yanId, receipt_id: receiptId, position, kind: 'item', raw_text: name.toUpperCase(), name, brand: null, category: 'Produce',
			quantity, unit, unit_price_cents: unitCents, total_cents: totalCents, computed: false, issue: null, size_amount: null, size_unit: null
		});
		const oldest = await receipt(parivar, '2026-09-01');
		const older = await receipt(parivar, '2026-09-19');
		const newer = await receipt(fiesta, '2026-10-02');
		const undated = await receipt(fiesta, null);
		const { error } = await admin.from('receipt_items').insert([
			item(oldest, 0, 'Okra', 'lb', 1, 100, 100),
			item(older, 0, 'Okra', 'lb', 1.4, 299, 419),
			item(newer, 0, 'Okra', 'lb', 1.19, 297, 353),
			item(older, 1, 'Ramen', 'ea', 2, null, 96),
			item(newer, 1, 'Ramen', 'ea', 3, 50, 150),
			item(older, 2, 'Limes', 'ea', 1, null, 99),
			item(newer, 2, 'Limes', 'ea', 1, null, 99),
			item(newer, 3, 'Toor dal', 'ea', 1, null, 699),
			item(undated, 0, 'Toor dal', 'ea', 1, null, 999)
		]);
		if (error) throw error;

		const { data } = await yan.rpc('my_price_changes', { how_many: 5 });
		const both = { bought_on: '2026-10-02', before_on: '2026-09-19', now_receipt: newer, before_receipt: older };
		expect(data).toMatchObject([
			{ name: 'Ramen', per: 'ea', now_cents: 50, before_cents: 48, store: 'Fiesta', before_store: 'Parivar', ...both },
			{ name: 'Okra', per: 'lb', now_cents: 297, before_cents: 299, store: 'Fiesta', before_store: 'Parivar', ...both }
		]);
		expect(data).toHaveLength(2);
		// the short history: newest first, undated purchases left out
		expect(data![1].history.map((h: { on: string; cents: number }) => [h.on, h.cents])).toEqual([
			['2026-10-02', 297],
			['2026-09-19', 299],
			['2026-09-01', 100]
		]);
		expect(((await alice.rpc('my_price_changes')).data ?? []).some((p: { name: string }) => p.name === 'Okra')).toBe(false);
		const anon = createClient(url, publishable, noSession);
		expect((await anon.rpc('my_price_changes')).error).not.toBeNull();
	});
});

describe('shared products', () => {
	const vector = (hot: number) => `[${Array.from({ length: 1024 }, (_, i) => (i === hot ? 1 : 0)).join(',')}]`;

	it('are read only through your own receipt lines, added only by the server, and found by meaning', async () => {
		const tag = crypto.randomUUID().slice(0, 8);
		const made = await admin.from('products').insert([
			{ name: `Test bananas ${tag}`, match_key: `banana test ${tag}`, embedding: vector(3) },
			{ name: `Test milk ${tag}`, match_key: `milk test ${tag}`, embedding: vector(7) }
		]).select('id, name');
		expect(made.error).toBeNull();
		try {
			const twin = await admin.from('products').insert({ name: `Test banana ${tag}`, match_key: `banana test ${tag}`, embedding: vector(3) });
			expect(twin.error?.code).toBe('23505');

			// nobody can list what other people bought; a product shows once your own line points to it
			expect((await alice.from('products').select('name').like('name', `%${tag}`)).data).toEqual([]);
			const line = await admin.from('receipt_items').insert({ user_id: aliceId, receipt_id: aliceReceiptId, position: 900, kind: 'item', raw_text: 'BANANAS', total_cents: 50, product_id: made.data![0].id }).select('id').single();
			expect(line.error).toBeNull();
			expect((await alice.from('products').select('name').like('name', `%${tag}`)).data).toEqual([{ name: `Test bananas ${tag}` }]);
			expect((await bob.from('products').select('name').like('name', `%${tag}`)).data).toEqual([]);
			await admin.from('receipt_items').delete().eq('id', line.data!.id);
			expect((await alice.from('products').insert({ name: `Sneaky ${tag}`, match_key: `sneaky ${tag}`, embedding: vector(1) })).error).not.toBeNull();
			expect((await createClient(url, publishable, noSession).from('products').select('name').like('name', `%${tag}`)).data ?? []).toEqual([]);

			const near = await admin.rpc('nearest_products', { p_embedding: vector(3), p_count: 1 });
			expect(near.data[0].name).toBe(`Test bananas ${tag}`);
			expect(near.data[0].similarity).toBeCloseTo(1, 5);
			expect((await alice.rpc('nearest_products', { p_embedding: vector(3), p_count: 1 })).error).not.toBeNull();
		} finally {
			await admin.from('products').delete().in('id', made.data!.map((p) => p.id));
		}
	});
});

describe('chosen aisles', () => {
	it('moves only the lines of the shopper who chose, now and for later receipts, and stays private', async () => {
		const dee = await signedInUser('dee');
		const deeId = userIds[userIds.length - 1];
		const eve = await signedInUser('eve');
		const eveId = userIds[userIds.length - 1];
		const tag = crypto.randomUUID().slice(0, 8);
		const vector = `[${Array.from({ length: 1024 }, (_, i) => (i === 5 ? 1 : 0)).join(',')}]`;
		const made = await admin.from('products').insert({ name: `Noodle soup ${tag}`, match_key: `noodle soup ${tag}`, embedding: vector }).select('id').single();
		if (made.error) throw made.error;
		const soup = made.data.id as string;
		try {
			const lineFor = async (userId: string) => {
				const receipt = (await admin.from('receipts').insert({ user_id: userId, created_at: '2026-09-01T00:00:00Z' }).select('id').single()).data!.id;
				const line = await admin.from('receipt_items').insert({ user_id: userId, receipt_id: receipt, position: 0, kind: 'item', raw_text: 'A F CHICKEN NOODLE SOUP', name: `Noodle soup ${tag}`, category: 'Produce', quantity: 1, unit: 'ea', total_cents: 189, computed: false, product_id: soup }).select('id').single();
				if (line.error) throw line.error;
				return line.data.id as string;
			};
			const [deeLine, eveLine] = [await lineFor(deeId), await lineFor(eveId)];

			await chooseAisle(dee, soup, 'Pantry');
			const aisleOf = async (id: string) => (await admin.from('receipt_items').select('category').eq('id', id).single()).data!.category;
			expect(await aisleOf(deeLine)).toBe('Pantry');
			expect(await aisleOf(eveLine)).toBe('Produce');

			expect((await myAisles(dee, [soup, null])).get(soup)).toBe('Pantry');
			expect((await myAisles(eve, [soup])).size).toBe(0);
			expect((await eve.from('my_aisles').insert({ user_id: deeId, product_id: soup, aisle: 'Frozen' })).error).not.toBeNull();
			expect((await dee.from('my_aisles').insert({ product_id: soup, aisle: 'Aisle 9' })).error).not.toBeNull();

			await chooseAisle(dee, soup, 'Frozen');
			expect((await myAisles(dee, [soup])).get(soup)).toBe('Frozen');
		} finally {
			await admin.from('products').delete().eq('id', soup);
		}
	});
});

// a shopper of their own: by now alice has added as many receipts this minute as the burst limit allows
describe('store places', () => {
	let carol: SupabaseClient;
	let carolStoreId: string;

	beforeAll(async () => {
		carol = await signedInUser('carol');
		const store = await carol.from('stores').insert({ name: 'Fiesta' }).select().single();
		if (store.error) throw store.error;
		carolStoreId = store.data.id;
	});

	it('gives each shopper only their own stores and branches; receipts at one spot are one branch', async () => {
		const receipt = (day: string, lat: number, guess = false) => ({
			store_id: carolStoreId, status: 'saved', purchased_on: day, total_cents: 500, store_address: '8130 Kirby Dr, Houston, TX 77054', store_lat: lat, store_lng: -95.4126, branch_guess: guess
		});
		const saved = await carol.from('receipts').insert([receipt('2026-10-02', 29.6890), receipt('2026-10-09', 29.68902), receipt('2026-10-12', 29.75, true)]).select();
		expect(saved.error).toBeNull();

		const mine = await carol.rpc('my_store_places');
		expect(mine.data).toEqual([{ id: carolStoreId, name: 'Fiesta', visits: 3 }]);
		const branches = await carol.rpc('my_branches');
		expect(branches.data.map((b: { branch_key: string; visits: number; guess: boolean; last_visit: string }) => [b.branch_key, b.visits, b.guess, b.last_visit]).sort()).toEqual([
			['29.689,-95.413', 2, false, '2026-10-09'],
			['29.750,-95.413', 1, true, '2026-10-12']
		]);
		for (const fn of ['my_store_places', 'my_branches']) {
			expect((await bob.rpc(fn)).data).toEqual([]);
			expect((await createClient(url, publishable, noSession).rpc(fn)).error).not.toBeNull();
		}
	});

	it('reads every US ZIP code to a point, for signed-in shoppers only', async () => {
		expect((await carol.from('zip_codes').select('lat, lng').eq('zip', '77036').single()).data).toEqual({ lat: expect.closeTo(29.7, 1), lng: expect.closeTo(-95.53, 1) });
		expect((await carol.from('zip_codes').insert({ zip: '00000', lat: 30, lng: -90 })).error).not.toBeNull();
		expect((await createClient(url, publishable, noSession).from('zip_codes').select('zip').eq('zip', '77036')).data ?? []).toEqual([]);
	});

	it('refuses a map point without the address it came from, or half a point', async () => {
		const noAddress = await carol.from('receipts').insert({ total_cents: 5, store_lat: 29.7, store_lng: -95.4 });
		const half = await carol.from('receipts').insert({ total_cents: 5, store_address: '1 Main St, Houston, TX', store_lat: 29.7 });
		expect(noAddress.error?.code).toBe('23514');
		expect(half.error?.code).toBe('23514');
	});
});
