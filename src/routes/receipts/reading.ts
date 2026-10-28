import { deserialize } from '$app/forms';
import type { Printed } from '../../process-receipt.server';
import { money, storeName } from '../../format';
import { toast } from '../../toasts.svelte';

export type { Printed };
export type Outcome = { state: 'saved' | 'review' | 'paused' | 'reading' | 'failed'; note?: string; printed?: Printed };

export const problems: Record<string, string> = {
	not_a_receipt: "That doesn't look like a receipt.",
	handwritten: "Handwritten bills can't be read.",
	no_lines: 'No items were found on it. If it is a receipt, hold the phone closer so it fills the screen.',
	bad_photo: "Couldn't read this photo. Hold the phone closer so the receipt fills the screen, and try again."
};

// the actions live on the receipts page, so any page can upload and read through them
export async function post(action: string, body: FormData) {
	const response = await fetch(`/receipts?/${action}`, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
	return deserialize(await response.text());
}

// reads a receipt that is already uploaded
export async function readReceipt(id: string): Promise<Outcome> {
	const body = new FormData();
	body.set('id', id);
	const result = await post('process', body);
	if (result.type !== 'success' || !result.data) return { state: 'failed', note: 'Try again in a moment.' };
	const outcome = result.data as { status: string; problem?: string; note?: string | null; printed?: Printed };
	if (outcome.status === 'saved' || outcome.status === 'review') return { state: outcome.status, printed: outcome.printed };
	if (outcome.status === 'paused') return { state: 'paused', note: outcome.note ?? undefined };
	if (outcome.status === 'busy') return { state: 'reading', note: 'It is already being read.' };
	// these give their daily slot back, so the shopper is told they cost nothing
	const known = problems[outcome.problem ?? ''];
	return { state: 'failed', note: known ? `${known} It didn't count toward today's receipts.` : 'Try again.' };
}

// Told only when the result is not already on screen: the shopper left the page the photo was added on,
// or a read started from a one-line prompt failed.
export function announce(id: string, outcome: Outcome) {
	const store = storeName(outcome.printed?.store ?? null);
	const open = { label: 'Open', href: `/receipts/${id}` };
	if (outcome.state === 'saved') {
		const total = outcome.printed?.totalCents;
		toast({ key: `read:${id}`, kind: 'done', text: `${store ?? 'Your'} receipt is ready${total != null ? ` · ${money(total)}` : ''}`, action: open });
	} else if (outcome.state === 'review') toast({ key: `read:${id}`, kind: 'done', text: `${store ?? 'A'} receipt needs a quick look`, action: open });
	else if (outcome.state === 'paused') toast({ key: `read:${id}`, kind: 'error', text: outcome.note ?? 'Reading is paused. The photo is saved to try later.' });
	else if (outcome.state === 'failed')
		toast({
			key: `read:${id}`,
			kind: 'error',
			text: `A receipt couldn't be read.${outcome.note && !outcome.note.startsWith('Try again') ? ` ${outcome.note}` : ''}`,
			action: { label: 'Try again', run: async () => announce(id, await readReceipt(id)) }
		});
}
