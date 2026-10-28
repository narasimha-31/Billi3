import { error, json } from '@sveltejs/kit';
import { addressesLike, branchesOf, searchPlaces } from '../../../../store-branch.server';
import { mapState } from '../../../../store-map.server';
import { searchClosed, storeOnWeb } from '../../../../web-lookup.server';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f-]{36}$/;
const SHOWN = 6;
const PLACES = 8;

// Other branches of one of the shopper's stores near their ZIP, from OpenStreetMap or else the web, for "Which one?".
// With ?q, whatever places match what the shopper typed, for picking the store from a list: a typed
// address gets addresses like it, a name gets shops by that name, then any place by it, then the web.
export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = await locals.getUser();
	if (!user) error(401, 'Signed out');
	if (!UUID.test(params.id)) error(404, 'Not found');
	const [map, store] = await Promise.all([mapState(locals.supabase), locals.supabase.from('stores').select('name').eq('id', params.id).maybeSingle()]);
	if (store.error) throw store.error;
	if (!store.data) error(404, 'Not found');
	if (!map.you) return json({ branches: [], places: [] });
	const typed = url.searchParams.get('q')?.trim().slice(0, 80) ?? '';
	if (typed.length >= 3) {
		if (/^\d/.test(typed)) return json({ places: (await addressesLike(typed, map.you)).slice(0, PLACES) });
		const shops = await searchPlaces(typed, map.you);
		const onMap = shops.length ? shops : await addressesLike(typed, map.you);
		if (!onMap.length && (await searchClosed(user.id))) return json({ places: [], searchClosed: true });
		// small shops missing from OpenStreetMap are looked for on the web
		const places = onMap.length ? onMap : await storeOnWeb(typed, map.you, user.id);
		return json({ places: places.slice(0, PLACES), fromWeb: !onMap.length && places.length > 0 });
	}
	const found = (await branchesOf(store.data.name, map.you)).filter((b) => b.address);
	if (found.length) return json({ branches: found.slice(0, SHOWN) });
	// a small shop missing from OpenStreetMap: its branches near the ZIP from the web, so none need typing
	const web = (await searchClosed(user.id)) ? [] : await storeOnWeb(store.data.name, map.you, user.id);
	return json({ branches: web.slice(0, SHOWN), fromWeb: web.length > 0 });
};
