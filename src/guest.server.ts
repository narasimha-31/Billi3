import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_SECRET_KEY } from '$env/static/private';
import { admin } from './admin.server';
import { deleteAccount } from './delete-account.server';
import { sampleBranches, sampleHome, sampleReceipts } from './routes/demo/sample-receipts';

// guest sessions one network can start a day; a judging room shares one address, so not too few
export const GUEST_STARTS_PER_NETWORK = 10;

// the address is kept only as a salted hash, so the table can't be read back into addresses
async function networkOf(ip: string) {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SUPABASE_SECRET_KEY}:${ip}`));
	return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// guests are gone three hours after they start, photos and all; done as new guests arrive and daily
export async function dropOldGuests() {
	const { data, error } = await admin.rpc('old_guests');
	if (error) throw error;
	for (const id of (data ?? []) as string[]) await deleteAccount(id);
	return (data ?? []).length;
}

// the sample shopper's receipts, so a guest opens a full app and not an empty one
async function fillWithSamples(userId: string) {
	const settings = await admin.from('user_settings').upsert({ user_id: userId, keep_store_location: true, zip_code: sampleHome.zip });
	if (settings.error) throw settings.error;
	const names = [...new Set(sampleReceipts.map((r) => r.store))];
	const stores = await admin.from('stores').insert(names.map((name) => ({ user_id: userId, name }))).select('id, name');
	if (stores.error) throw stores.error;
	const storeId = new Map(stores.data.map((s) => [s.name as string, s.id as string]));
	const placed = new Map(sampleBranches.map((b) => [b.name, b]));
	const receipts = await admin
		.from('receipts')
		.insert(
			sampleReceipts.map((r) => {
				const branch = placed.get(r.store)!;
				return { user_id: userId, store_id: storeId.get(r.store), purchased_on: r.date, total_cents: r.totalCents, subtotal_cents: r.totalCents, status: 'saved', channel: r.channel, store_address: branch.address, store_lat: branch.lat, store_lng: branch.lng, branch_guess: false };
			})
		)
		.select('id');
	if (receipts.error) throw receipts.error;
	const items = sampleReceipts.flatMap((r, i) =>
		r.lines.map((l, position) => ({ user_id: userId, receipt_id: receipts.data[i].id, position, kind: 'item', raw_text: l.raw, name: l.name, category: l.category, quantity: l.quantity, unit: l.unit, unit_price_cents: l.unitPriceCents, total_cents: l.totalCents, computed: false }))
	);
	const saved = await admin.from('receipt_items').insert(items);
	if (saved.error) throw saved.error;
}

// A fresh account marked as a guest by the server, filled with the samples, and signed in on this browser.
export async function startGuest(supabase: SupabaseClient, ip: string): Promise<'started' | 'network'> {
	const network = await networkOf(ip);
	const since = new Date(Date.now() - 86_400_000).toISOString();
	const started = await admin.from('guest_starts').select('id', { count: 'exact', head: true }).eq('network', network).gt('created_at', since);
	if (started.error) throw started.error;
	if ((started.count ?? 0) >= GUEST_STARTS_PER_NETWORK) return 'network';

	await dropOldGuests();
	const logged = await admin.from('guest_starts').insert({ network });
	if (logged.error) throw logged.error;
	const email = `guest-${crypto.randomUUID()}@guest.billie.test`;
	const made = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { guest: true }, user_metadata: { full_name: 'Guest' } });
	if (made.error) throw made.error;
	try {
		await fillWithSamples(made.data.user.id);
		const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
		if (link.error) throw link.error;
		const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.data.properties.hashed_token });
		if (error) throw error;
	} catch (problem) {
		await deleteAccount(made.data.user.id);
		throw problem;
	}
	return 'started';
}
