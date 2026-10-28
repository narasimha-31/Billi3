import { error as httpError, fail, redirect } from '@sveltejs/kit';
import { renderSVG } from 'uqr';
import { createPhoneLink } from '../../phone-link.server';
import { processReceipt } from '../../process-receipt.server';
import { guestsClosed } from '../../nebius.server';
import { readingPaused } from '../../receipt-reader.server';
import { savePhoto, uploadWindow } from '../../save-photo.server';
import { firstNameOf } from '../../session.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await locals.getUser();
	if (!user) redirect(303, '/');
	const paused = readingPaused();
	const closed = user.guest ? guestsClosed(user.id) : null;

	const [list, uploaded] = await Promise.all([
		locals.supabase
			.from('receipts')
			// items and the names the reader was unsure of, counted in the same request as the list
			.select('id, status, problem, purchased_on, channel, total_cents, skipped_lines, created_at, processing_at, store_address, branch_key, branch_guess, stores(name), to_check:receipt_items(count), items:receipt_items(count)')
			.in('to_check.issue', ['unsure', 'unreadable'])
			.eq('items.kind', 'item')
			.order('created_at', { ascending: false })
			.limit(100),
		// counted from the upload log, so deleted receipts still count, exactly like the limit itself
		locals.supabase.rpc('my_upload_window')
	]);
	if (list.error) throw list.error;
	if (uploaded.error) throw uploaded.error;

	return {
		firstName: firstNameOf(user),
		uploads: uploadWindow(uploaded.data),
		dailyLimit: uploadWindow(uploaded.data).limit,
		paused: await paused,
		closed: await closed,
		receipts: list.data.map(({ stores, to_check, items, ...receipt }) => ({
			...receipt,
			toCheck: (to_check as { count: number }[])[0]?.count ?? 0,
			items: (items as { count: number }[])[0]?.count ?? 0,
			store: (Array.isArray(stores) ? stores[0]?.name : (stores as { name: string } | null)?.name) ?? null
		}))
	};
};

export const actions: Actions = {
	// one photo per request keeps every request far below the hosting body limit
	upload: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });

		const form = await request.formData();
		const saved = await savePhoto(locals.supabase, user.id, form.get('photo'), String(form.get('hash') ?? ''));
		if ('problem' in saved) return fail(saved.status, { problem: saved.problem });
		return { added: true, id: saved.id };
	},

	process: async ({ request, locals }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });

		const id = String((await request.formData()).get('id') ?? '');
		if (!/^[0-9a-f-]{36}$/.test(id)) httpError(400, 'bad receipt id');
		return await processReceipt(locals.supabase, user.id, id);
	},

	// a code the phone camera opens; making a new one cancels the last
	phone: async ({ locals, url }) => {
		const user = await locals.getUser();
		if (!user) return fail(401, { problem: 'signed out' });

		const { token, expiresAt } = await createPhoneLink(user.id);
		const qr = renderSVG(`${url.origin}/phone/${token}`, { border: 2, whiteColor: '#f7f4eb', blackColor: '#2b2620' });
		return { qr, expiresAt };
	}
};
