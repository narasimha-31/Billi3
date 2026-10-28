import { milesBetween, type Point } from './distance';
import { matchingBranches, photonPlaces, shopsFrom, type Branch } from './store-branch';

// OpenStreetMap's Nominatim search: free, no key, at most one request a second. It is sent the chain
// name and a box around the ZIP's centre, never the ZIP or anything about the shopper.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const BOX_DEGREES = 0.25;
const GAP_MS = 1100;

type Place = { display_name?: string; name?: string; lat?: string; lon?: string; extratags?: { brand?: string } | null; address?: Record<string, string | undefined> };

// Nominatim's answer in the shape Overpass would give, so one reader serves both
function asElements(places: Place[]) {
	return {
		elements: places.map((p) => ({
			lat: Number(p.lat),
			lon: Number(p.lon),
			tags: {
				...(p.name && { name: p.name }),
				// the full place description stands in when no street is tagged; a saved point needs an address
				...(p.display_name && { 'addr:full': p.display_name.split(',').slice(0, 4).join(',').trim() }),
				...(p.extratags?.brand && { brand: p.extratags.brand }),
				...(p.address?.road && { 'addr:street': p.address.road }),
				...(p.address?.house_number && { 'addr:housenumber': p.address.house_number }),
				...((p.address?.city ?? p.address?.town) && { 'addr:city': p.address.city ?? p.address.town }),
				...(p.address?.['ISO3166-2-lvl4']?.startsWith('US-') && { 'addr:state': p.address['ISO3166-2-lvl4'].slice(3) }),
				...(p.address?.postcode && { 'addr:postcode': p.address.postcode })
			}
		}))
	};
}

// named places near the ZIP for a search, or [] when the search fails
async function shopsNear(query: string, centre: Point) {
	const url = new URL(NOMINATIM);
	const box = [centre.lng - BOX_DEGREES, centre.lat + BOX_DEGREES, centre.lng + BOX_DEGREES, centre.lat - BOX_DEGREES];
	for (const [key, value] of Object.entries({ q: query, format: 'jsonv2', limit: '20', countrycodes: 'us', viewbox: box.map((n) => n.toFixed(4)).join(','), bounded: '1', addressdetails: '1', extratags: '1' }))
		url.searchParams.set(key, value);
	try {
		const response = await fetch(url, { headers: { 'user-agent': 'Billie/1.0 (+https://billi3.vercel.app)' }, signal: AbortSignal.timeout(6000) });
		if (!response.ok) throw new Error(`nominatim returned ${response.status}`);
		return shopsFrom(asElements(await response.json()));
	} catch (error) {
		// no suggestion this time; the shopper can still type the address
		console.warn('store search failed:', error instanceof Error ? error.message : error);
		return [];
	}
}

// every branch of the chain near the ZIP, nearest first
export async function branchesOf(storeName: string, centre: Point): Promise<Branch[]> {
	const query = storeName.replace(/#\s*\d+/g, ' ').replace(/\s+/g, ' ').trim();
	if (!query) return [];
	return matchingBranches(storeName, await shopsNear(query, centre), centre);
}

// what the shopper typed, the way a map app lists places: name, address, how far; nearest first
export async function searchPlaces(query: string, centre: Point) {
	return (await shopsNear(query, centre))
		.filter((shop) => shop.address)
		.map((shop) => ({ name: shop.name ?? shop.brand, address: shop.address!, lat: shop.lat, lng: shop.lng, miles: milesBetween(centre, shop) }))
		.sort((a, b) => a.miles - b.miles);
}

// several stores, one request a second as Nominatim asks
export async function branchesNear(storeNames: string[], centre: Point) {
	const found = new Map<string, Branch | null>();
	for (const [i, name] of storeNames.entries()) {
		if (i) await new Promise((wait) => setTimeout(wait, GAP_MS));
		found.set(name, (await branchesOf(name, centre))[0] ?? null);
	}
	return found;
}

// Photon, OpenStreetMap's search made for typing: free, no key, suggestions as each word is typed.
// It gets what was typed and the ZIP's centre rounded to about a kilometre, so the nearest come first.
const PHOTON = 'https://photon.komoot.io/api/';

export async function addressesLike(typed: string, centre: Point) {
	const url = new URL(PHOTON);
	for (const [key, value] of Object.entries({ q: typed, lat: centre.lat.toFixed(2), lon: centre.lng.toFixed(2), limit: '10', lang: 'en' })) url.searchParams.set(key, value);
	try {
		const response = await fetch(url, { headers: { 'user-agent': 'Billie/1.0 (+https://billi3.vercel.app)' }, signal: AbortSignal.timeout(4000) });
		if (!response.ok) throw new Error(`photon returned ${response.status}`);
		return photonPlaces(await response.json(), centre, typed);
	} catch (error) {
		console.warn('address search failed:', error instanceof Error ? error.message : error);
		return [];
	}
}
