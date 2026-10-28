import { DISPLAY_COLUMNS, DISPLAY_COOKIE, DISPLAY_COOKIE_OPTIONS, displayCookie, fromRow } from '../display';
import type { LayoutServerLoad } from './$types';

// A look chosen on one device reaches the others: on each full page load the account's saved look
// replaces a stale cookie before the first frame is drawn. Row security returns only the shopper's own
// row, and nothing is asked when no one is signed in.
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!cookies.getAll().some((c) => c.name.startsWith('sb-'))) return {};
	const guest = (await locals.getUser())?.guest ?? false;
	const { data } = await locals.supabase.from('user_settings').select(DISPLAY_COLUMNS).maybeSingle();
	if (!data) return { guest };
	const saved = fromRow(data);
	if (displayCookie(saved) !== cookies.get(DISPLAY_COOKIE)) {
		cookies.set(DISPLAY_COOKIE, displayCookie(saved), DISPLAY_COOKIE_OPTIONS);
		locals.display = saved;
	}
	return { guest };
};
