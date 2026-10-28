import { env } from '$env/dynamic/private';
import { admin } from './admin.server';
import { milesBetween, type Point } from './distance';
import { addressesIn } from './store-branch';
import { placeStore } from './store-place.server';

export type Found = { title: string; content: string; url: string; published: string | null };

// searches a shopper can set off in a day; each one is a paid call. Guests get fewer, from a pool of their own.
export const SEARCHES_PER_DAY = 20;
export const GUEST_SEARCHES_PER_DAY = 10;
export const GUEST_SEARCHES_ALL = 100;

// why a person can't search now, if they can't
export async function searchClosed(userId: string): Promise<'mine' | 'guests' | null> {
	const [mine, guest] = await Promise.all([searchedToday(userId), admin.rpc('is_guest', { p_user_id: userId })]);
	if (guest.error) throw guest.error;
	if (!guest.data) return mine >= SEARCHES_PER_DAY ? 'mine' : null;
	if (mine >= GUEST_SEARCHES_PER_DAY) return 'mine';
	const all = await admin.rpc('guest_searches_today');
	if (all.error) throw all.error;
	return Number(all.data) >= GUEST_SEARCHES_ALL ? 'guests' : null;
}

async function searchedToday(userId: string) {
	const { count, error } = await admin
		.from('ai_calls')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('model', 'tavily/search')
		.gte('created_at', new Date().toISOString().slice(0, 10));
	if (error) throw error;
	return count ?? 0;
}

// One Tavily search, logged with what it was for. A failed or capped search gives null, so the
// caller keeps what it had and goes on. `extra` takes Tavily's own filters (topic, time_range, domains).
export async function tavily(query: string, results: number, length: number, purpose: string, userId: string | null, signal: AbortSignal, extra: Record<string, unknown> = {}): Promise<Found[] | null> {
	const key = env.TAVILY_API_KEY;
	if (!key) return null;
	if (userId && (await searchClosed(userId))) return null;
	const started = Date.now();
	let found: Found[] | null = null;
	try {
		const response = await fetch('https://api.tavily.com/search', {
			method: 'POST',
			headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
			body: JSON.stringify({ ...extra, query, max_results: results, search_depth: 'basic' }),
			signal
		});
		if (response.ok) {
			const json = (await response.json()) as { results?: { title?: unknown; content?: unknown; url?: unknown; published_date?: unknown }[] };
			found = (json.results ?? []).slice(0, results).map((r) => ({
				title: String(r.title ?? '').slice(0, 300),
				content: String(r.content ?? '').slice(0, length),
				url: String(r.url ?? ''),
				published: typeof r.published_date === 'string' ? r.published_date : null
			}));
		}
	} catch (problem) {
		console.error('web lookup failed', problem instanceof Error ? problem.name : problem);
	}
	const logged = await admin.from('ai_calls').insert({ user_id: userId, model: 'tavily/search', served_model: null, purpose, input_tokens: 0, output_tokens: 0, cost_micros: 0, duration_ms: Date.now() - started, ok: found !== null });
	if (logged.error) console.error('lookup log failed', logged.error.message);
	return found;
}

const STORE_RESULTS = 5;
const STORE_MS = 6000;
// addresses checked on the map per search, and how far one may be from the shopper's ZIP
const MOST_ADDRESSES = 8;
const NEAR_MILES = 40;

// the town around the ZIP's centre, so a store's name can be searched where the shopper lives
export async function townAt(you: Point): Promise<string | null> {
	const url = new URL('https://nominatim.openstreetmap.org/reverse');
	for (const [key, value] of Object.entries({ lat: you.lat.toFixed(3), lon: you.lng.toFixed(3), zoom: '10', format: 'jsonv2' })) url.searchParams.set(key, value);
	try {
		const response = await fetch(url, { headers: { 'user-agent': 'Billie/1.0 (+https://billi3.vercel.app)' }, signal: AbortSignal.timeout(4000) });
		if (!response.ok) return null;
		const { address } = (await response.json()) as { address?: Record<string, string | undefined> };
		const state = address?.['ISO3166-2-lvl4']?.replace('US-', '');
		const town = address?.city ?? address?.town ?? address?.county;
		return town ? [town, state].filter(Boolean).join(' ') : null;
	} catch {
		return null;
	}
}

// Small shops are often missing from OpenStreetMap. Their addresses are on the web: their own site,
// listings and reviews. The store's name and the town go out, never the shopper; the addresses found
// are placed on the map and only the ones near the ZIP are offered.
export async function storeOnWeb(name: string, you: Point, userId: string | null) {
	const town = await townAt(you);
	if (!town) return [];
	const found = await tavily(`"${name}" ${town} address`, STORE_RESULTS, 1000, 'store_lookup', userId, AbortSignal.timeout(STORE_MS));
	if (!found) return [];
	const addresses = addressesIn(found.map((r) => `${r.title} ${r.content}`).join(' ')).slice(0, MOST_ADDRESSES);
	const placed = await Promise.all(addresses.map(async (address) => ({ address, point: await placeStore(address) })));
	// several pages often list one shop, written differently; one point is one place
	const unique = new Map<string, { name: string; address: string; lat: number; lng: number; miles: number }>();
	for (const { address, point } of placed) {
		const key = point && `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
		if (key && !unique.has(key)) unique.set(key, { name, address, lat: point.lat, lng: point.lng, miles: milesBetween(you, point) });
	}
	return [...unique.values()]
		.filter((place) => place.miles <= NEAR_MILES)
		.sort((a, b) => a.miles - b.miles);
}
