import type { SupabaseClient } from '@supabase/supabase-js';
import { admin } from './admin.server';
import { nameLines } from './item-names.server';
import { myAisles } from './aisle-choice.server';
import { AiUnavailable, BadAnswer } from './nebius.server';
import { checkReading } from './receipt-check';
import { MODELS } from './ai-budget';
import { readReceipt, type VisionRole } from './receipt-reader.server';
import { itemRows } from './receipt-rows';
import { assignProducts } from './product-merge.server';
import { placeStore } from './store-place.server';
import { guessSpot, mapState, myBranches } from './store-map.server';
import { townAt } from './web-lookup.server';
import { sizeProblem } from './routes/receipts/photo-rules';

// what was saved, for the screen to print back as a receipt
export type Printed = {
	store: string | null;
	date: string | null;
	totalCents: number | null;
	matches: boolean;
	lines: { name: string; totalCents: number }[];
};

export type ProcessResult =
	| { status: 'saved' | 'review'; skipped: number; printed: Printed }
	| { status: 'failed'; problem: 'not_a_receipt' | 'handwritten' | 'no_lines' | 'bad_photo' }
	| { status: 'busy' }
	| { status: 'paused'; note: string | null };

// a read that has been "processing" this long crashed part way and may be claimed again
const STALE_MS = 2 * 60 * 1000;

async function storeFor(supabase: SupabaseClient, name: string) {
	const find = () => supabase.from('stores').select('id').ilike('name', name.replace(/[%_\\]/g, '\\$&')).maybeSingle();
	const found = await find();
	if (found.data) return found.data.id as string;
	const created = await supabase.from('stores').insert({ name }).select('id').single();
	if (created.data) return created.data.id as string;
	// another device created it a moment ago
	const again = await find();
	if (again.data) return again.data.id as string;
	throw created.error;
}

// Runs as the signed-in user, so row level security covers every read and write here.
export async function processReceipt(supabase: SupabaseClient, userId: string, receiptId: string): Promise<ProcessResult> {
	// Claim in one statement: only a waiting, retryable or crashed receipt can be claimed, so two
	// devices pressing "process" at once can never both pay for a model call.
	const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
	const { data: claimed, error: claimError } = await supabase
		.from('receipts')
		.update({ status: 'processing', processing_at: new Date().toISOString(), problem: null })
		.eq('id', receiptId)
		.or(`status.eq.pending,and(status.eq.failed,problem.eq.error),and(status.eq.processing,processing_at.lt.${staleBefore})`)
		.select('id, image_path')
		.maybeSingle();
	if (claimError) throw claimError;
	if (!claimed) return { status: 'busy' };

	const photoPath: string | null = claimed.image_path;
	const finish = async (fields: Record<string, unknown>) => {
		const { error } = await supabase.from('receipts').update({ processing_at: null, ...fields }).eq('id', receiptId);
		if (error) throw error;
	};
	const dropPhoto = async () => {
		if (photoPath) await supabase.storage.from('receipts').remove([photoPath]);
	};
	// the photo is gone, so its fingerprint goes too: the same photo can be added again if we got it wrong.
	// Nothing was read from it, so its daily slot comes back (the log is only writable by the server).
	const fail = async (problem: 'not_a_receipt' | 'handwritten' | 'no_lines' | 'bad_photo') => {
		await dropPhoto();
		await finish({ status: 'failed', problem, image_path: null, image_hash: null });
		const given = await admin.from('upload_log').update({ given_back: true }).eq('receipt_id', receiptId);
		if (given.error) throw given.error;
		return { status: 'failed' as const, problem };
	};

	try {
		if (!photoPath) return await fail('bad_photo');
		// the row is made before the upload, so a request that died in between leaves a row with no photo
		const download = await supabase.storage.from('receipts').download(photoPath);
		if (download.error) return await fail('bad_photo');
		const bytes = new Uint8Array(await download.data.arrayBuffer());

		// free checks before any tokens are spent
		if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || sizeProblem(bytes)) return await fail('bad_photo');

		let readBy: VisionRole = 'vision';
		let checked = checkReading(await readReceipt(bytes, userId, undefined, (role) => (readBy = role)));
		// the printed item count says a count was missed: the backup model reads it once more, and wins only if its count fits
		if (checked.ok && checked.counts_match === false) {
			const second = await readReceipt(bytes, userId, ['visionBackup'])
				.then((reading) => checkReading(reading))
				.catch(() => null);
			if (second?.ok && second.counts_match) {
				checked = second;
				readBy = 'visionBackup';
			}
		}
		if (!checked.ok) return await fail(checked.reason);

		const { data: settings } = await supabase
			.from('user_settings')
			.select('keep_store_location, keep_photos')
			.eq('user_id', userId)
			.maybeSingle();
		// the store name is always kept: comparing stores is what the app is for (decided Oct 16)
		const storeId = checked.store ? await storeFor(supabase, checked.store) : null;

		const items = checked.lines.filter((l) => l.kind === 'item');
		const names = await nameLines(
			supabase,
			userId,
			storeId,
			items.map((l) => l.raw),
			items.map((l) => ['lb', 'kg', 'oz', 'g'].includes(l.unit))
		);
		const { rows, skipped } = itemRows(checked.lines, names);
		// only names the namer was sure of join the shared product list; a guess waits for the shopper
		const sure = rows.filter((r) => r.kind === 'item' && r.name !== null && r.issue !== 'unsure');
		const products = await assignProducts(userId, sure.map((r) => r.name!));
		const productOf = new Map(sure.map((r, i) => [r, products[i]]));
		// an aisle the shopper picked for a product beats the model's guess
		const mine = await myAisles(supabase, products.map((p) => p.productId));

		// a crashed earlier attempt may have left lines behind
		const cleared = await supabase.from('receipt_items').delete().eq('receipt_id', receiptId);
		if (cleared.error) throw cleared.error;
		const inserted = await supabase.from('receipt_items').insert(
			rows.map((row) => {
				const product = productOf.get(row);
				return {
					...row,
					category: (product?.productId && mine.get(product.productId)) || row.category,
					receipt_id: receiptId,
					product_id: product?.productId ?? null,
					maybe_product_id: product?.maybeProductId ?? null
				};
			})
		);
		if (inserted.error) throw inserted.error;

		const keepPhoto = settings?.keep_photos === true;
		if (!keepPhoto) await dropPhoto();

		const needsReview = checked.needs_review || rows.some((r) => r.issue === 'line_math');
		// The branch only means something next to a kept store name, and only with the map on. With no
		// address printed, the shopper's usual branch of that store stands in, marked as a guess;
		// with none, the receipt stays off the map until the shopper picks the place.
		const mapOn = storeId !== null && settings?.keep_store_location === true;
		const storeAddress = mapOn ? checked.storeAddress : null;
		const map = mapOn ? await mapState(supabase) : null;
		// many receipts print only the street; the shopper's own town keeps it from landing in another city
		const town = storeAddress && !/\b\d{5}\b/.test(storeAddress) && map?.you ? await townAt(map.you) : null;
		const point = storeAddress ? await placeStore(town ? `${storeAddress}, ${town}` : storeAddress) : null;
		let guess = null;
		if (mapOn && !storeAddress && checked.store && map?.you) guess = guessSpot({ id: storeId! }, map.you, await myBranches(supabase));
		await finish({
			status: needsReview ? 'review' : 'saved',
			store_id: storeId,
			store_address: storeAddress ?? guess?.address ?? null,
			store_lat: point?.lat ?? guess?.lat ?? null,
			store_lng: point?.lng ?? guess?.lng ?? null,
			branch_guess: guess !== null,
			purchased_on: checked.purchasedOn,
			channel: checked.channel,
			subtotal_cents: checked.subtotalCents,
			tax_cents: checked.taxCents,
			total_cents: checked.totalCents,
			skipped_lines: skipped,
			read_by: MODELS[readBy].id,
			image_path: keepPhoto ? photoPath : null
		});
		const printed: Printed = {
			store: storeId ? checked.store : null,
			date: checked.purchasedOn,
			totalCents: checked.totalCents,
			matches: checked.lines_match_subtotal,
			lines: rows.map((r) => ({ name: r.name ?? r.raw_text, totalCents: r.total_cents }))
		};
		return { status: needsReview ? 'review' : 'saved', skipped, printed };
	} catch (error) {
		if (error instanceof AiUnavailable) {
			await finish({ status: 'pending' });
			return { status: 'paused', note: error.note };
		}
		// every model lost its way in the photo; trying it again would only spend more
		if (error instanceof BadAnswer) return await fail('bad_photo');
		await finish({ status: 'failed', problem: 'error' });
		throw error;
	}
}
