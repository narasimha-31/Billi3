import { fail, redirect } from '@sveltejs/kit';
import { startGuest } from '../../guest.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (await locals.getUser()) redirect(303, '/home');
};

// a POST, never a link, so crawlers and link previews can't make accounts
export const actions: Actions = {
	start: async ({ locals, getClientAddress }) => {
		if (await locals.getUser()) redirect(303, '/home');
		const outcome = await startGuest(locals.supabase, getClientAddress());
		if (outcome === 'network') return fail(429, { problem: 'Too many guest sessions from this network today. Sign in with Google to keep going.' });
		redirect(303, '/home');
	}
};
