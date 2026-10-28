import { redirect } from '@sveltejs/kit';
import { DISPLAY_COLUMNS, DISPLAY_COOKIE, DISPLAY_COOKIE_OPTIONS, displayCookie, fromRow } from '../display';
import { deleteAccount } from '../delete-account.server';
import { signInWithCode } from '../session.server';
import type { Actions, PageServerLoad } from './$types';

const SIGNIN_WINDOW = 'signin_window';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const code = url.searchParams.get('code');
	if (code) {
		const ok = await signInWithCode(locals.supabase, code);
		// a new device picks up the display the shopper chose on another
		if (ok) {
			const { data } = await locals.supabase.from('user_settings').select(DISPLAY_COLUMNS).maybeSingle();
			cookies.set(DISPLAY_COOKIE, displayCookie(fromRow(data)), DISPLAY_COOKIE_OPTIONS);
		}
		const next = ok ? '/home' : '/?signin=failed';
		if (cookies.get(SIGNIN_WINDOW)) {
			cookies.delete(SIGNIN_WINDOW, { path: '/' });
			redirect(303, `/signed-in?next=${encodeURIComponent(next)}`);
		}
		redirect(303, next);
	}

	if (await locals.getUser()) redirect(303, '/home');
	return { signInFailed: url.searchParams.get('signin') === 'failed' };
};

export const actions: Actions = {
	google: async ({ url, locals, cookies }) => {
		if (url.searchParams.has('window')) cookies.set(SIGNIN_WINDOW, '1', { path: '/', maxAge: 600, httpOnly: true, sameSite: 'lax' });
		else cookies.delete(SIGNIN_WINDOW, { path: '/' });
		const { data, error } = await locals.supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: url.origin }
		});
		if (error) throw error;
		redirect(303, data.url);
	},

	// Supabase's default signs every device out; this device only is what people expect
	signout: async ({ locals, cookies }) => {
		const { error } = await locals.supabase.auth.signOut({ scope: 'local' });
		if (error) throw error;
		cookies.delete(DISPLAY_COOKIE, { path: '/' });
		redirect(303, '/');
	},

	// a guest's account goes at once, receipts, photos and all
	endguest: async ({ locals, cookies }) => {
		const user = await locals.getUser();
		if (!user?.guest) redirect(303, '/');
		const { error } = await locals.supabase.auth.signOut({ scope: 'local' });
		if (error) throw error;
		await deleteAccount(user.id);
		cookies.delete(DISPLAY_COOKIE, { path: '/' });
		redirect(303, '/');
	},

	signout_everywhere: async ({ locals, cookies }) => {
		const { error } = await locals.supabase.auth.signOut({ scope: 'global' });
		if (error) throw error;
		cookies.delete(DISPLAY_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};
