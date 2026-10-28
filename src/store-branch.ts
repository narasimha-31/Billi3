import { milesBetween, type Point } from './distance';

export type Shop = { name: string | null; brand: string | null; lat: number; lng: number; address: string | null };
export type Branch = Point & { address: string | null; miles: number };

const FILLER = new Set(['store', 'stores', 'the', 'inc', 'llc', 'co', 'no']);

// "FIESTA MART #18" and "Fiesta Mart" share the same words once store numbers and punctuation go
export function nameWords(name: string) {
	return name
		.toLowerCase()
		.replace(/#\s*\d+/g, ' ')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((w) => w && !/^\d+$/.test(w) && !FILLER.has(w));
}

// every word of the shorter name appears in the longer one, and the store's own first word, its
// distinctive one, is among them: "Mart" alone never stands for "Fiesta Mart"
function within(store: string[], other: string[]) {
	if (!store.length || !other.length) return false;
	const [short, long] = store.length <= other.length ? [store, other] : [other, store];
	return short.includes(store[0]) && short.every((w) => long.includes(w));
}

// Branches of a shopper's store near their ZIP, nearest first. A match on the shop's own name beats a
// match on its brand alone, so a Walmart Supercenter receipt finds Supercenters before a Neighborhood
// Market. One pass over the shops, then a sort of the few that match: O(shops + matches log matches).
export function matchingBranches(storeName: string, shops: Shop[], centre: Point): Branch[] {
	const words = nameWords(storeName);
	const scored = shops.flatMap((shop) => {
		const score = shop.name && within(words, nameWords(shop.name)) ? 2 : shop.brand && within(words, nameWords(shop.brand)) ? 1 : 0;
		return score ? [{ score, branch: { lat: shop.lat, lng: shop.lng, address: shop.address, miles: milesBetween(centre, shop) } }] : [];
	});
	const best = Math.max(0, ...scored.map((s) => s.score));
	return scored.filter((s) => s.score === best).map((s) => s.branch).sort((a, b) => a.miles - b.miles);
}

export const nearestBranch = (storeName: string, shops: Shop[], centre: Point): Branch | null => matchingBranches(storeName, shops, centre)[0] ?? null;

type Element = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

// Overpass answers with nodes (a point) and ways (a building, with its centre); both become shops
export function shopsFrom(answer: unknown): Shop[] {
	const elements = (answer as { elements?: Element[] })?.elements ?? [];
	return elements.flatMap((e) => {
		const lat = e.lat ?? e.center?.lat;
		const lng = e.lon ?? e.center?.lon;
		const tags = e.tags ?? {};
		if (typeof lat !== 'number' || typeof lng !== 'number' || (!tags.name && !tags.brand)) return [];
		const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
		const place = [tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(' ');
		const address = street ? [street, tags['addr:city'], place].filter(Boolean).join(', ') : (tags['addr:full'] ?? null);
		return [{ name: tags.name ?? null, brand: tags.brand ?? null, lat, lng, address }];
	});
}

// US street addresses written out in web text: "8130 Kirby Dr, Houston, TX 77054". Store pages and
// listings spell streets every which way (glued to a label, suite after a comma, the state in full), so
// the street type is the anchor and the ZIP the end.
const STREET = /(?<![\d.])\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.' -]{2,40}?\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Blvd|Boulevard|Hwy|Highway|Pkwy|Parkway|Ln|Lane|Way|Fwy|Freeway|Ct|Court|Pl|Place|Trl|Trail|Cir|Circle|Expy|Expressway|Loop|Plaza|Sq|Square)\.?(?:,?\s+(?:#|Ste\.?|Suite|Unit)\s*[A-Za-z0-9]+(?:\s?-\s?[A-Za-z0-9]+)?)?,?\s+[A-Za-z .'-]{2,30}?,?\s+(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?),?\s+\d{5}\b/g;

export function addressesIn(text: string): string[] {
	const seen = new Map<string, string>();
	for (const [found] of text.matchAll(STREET)) {
		const address = found.replace(/\s+/g, ' ').trim();
		const key = address.toLowerCase().replace(/[^a-z0-9]/g, '');
		if (!seen.has(key)) seen.set(key, address);
	}
	return [...seen.values()];
}

type PhotonFeature = { geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> };
const NEAR_MILES = 40;

// Photon's answer as places to pick: US only, a street address each, within a drive of the ZIP, nearest
// first. A street found without the house typed keeps the typed number, the way map apps fill it in.
export function photonPlaces(answer: unknown, centre: { lat: number; lng: number }, typed = '') {
	const typedNumber = typed.trim().match(/^\d+[a-z]?\b/i)?.[0] ?? null;
	const features = ((answer as { features?: PhotonFeature[] })?.features ?? []).flatMap((f) => {
		const p = f.properties ?? {};
		const [lng, lat] = (f.geometry?.coordinates ?? []) as number[];
		const text = (key: string) => (typeof p[key] === 'string' ? (p[key] as string) : null);
		const isStreet = text('type') === 'street';
		const road = isStreet ? text('name') : text('street');
		if (text('countrycode') !== 'US' || !Number.isFinite(lat) || !Number.isFinite(lng) || !road) return [];
		const street = [isStreet ? typedNumber : text('housenumber'), road].filter(Boolean).join(' ');
		const address = [street, text('city') ?? text('county'), [text('state'), text('postcode')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
		const named = !isStreet && text('name') && text('name') !== street ? text('name') : null;
		return [{ name: named, address, lat, lng, miles: milesBetween(centre, { lat, lng }) }];
	});
	const unique = [...new Map(features.map((f) => [f.address, f])).values()];
	return unique.filter((f) => f.miles <= NEAR_MILES).sort((a, b) => a.miles - b.miles);
}
