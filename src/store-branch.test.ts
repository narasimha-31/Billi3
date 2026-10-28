import { describe, expect, it } from 'vitest';
import { addressesIn, matchingBranches, nameWords, nearestBranch, photonPlaces, shopsFrom, type Shop } from './store-branch';

const centre = { lat: 29.7, lng: -95.5 };
const shop = (name: string | null, lat: number, brand: string | null = null): Shop => ({ name, brand, lat, lng: -95.5, address: null });

describe('nameWords', () => {
	it('drops store numbers, punctuation and filler words', () => {
		expect(nameWords('FIESTA MART #18')).toEqual(['fiesta', 'mart']);
		expect(nameWords('H-E-B')).toEqual(['h', 'e', 'b']);
		expect(nameWords('Store 2041 Kroger')).toEqual(['kroger']);
	});
});

describe('nearestBranch', () => {
	it('finds the nearest shop carrying the store name', () => {
		const found = nearestBranch('FIESTA MART #18', [shop('Fiesta Mart', 29.9), shop('Fiesta Mart', 29.72), shop('Kroger', 29.7)], centre);
		expect(found?.lat).toBe(29.72);
		expect(found?.miles).toBeCloseTo(1.38, 1);
	});

	it('prefers the shop name over a brand-only match, even when farther', () => {
		const found = nearestBranch('WALMART SUPERCENTER', [shop('Walmart Neighborhood Market', 29.71, 'Walmart'), shop('Walmart Supercenter', 29.8)], centre);
		expect(found?.lat).toBe(29.8);
	});

	it('falls back to the brand when no shop name matches', () => {
		expect(nearestBranch('WALMART', [shop('Store 5', 29.75, 'Walmart')], centre)?.lat).toBe(29.75);
	});

	it('never matches on one shared word of a longer name', () => {
		expect(nearestBranch('FIESTA MART', [shop('Mart', 29.7), shop('Fiesta Party Supplies', 29.7)], centre)).toBeNull();
		expect(nearestBranch('#12', [shop('Kroger', 29.7)], centre)).toBeNull();
	});
});

describe('matchingBranches', () => {
	it('lists every branch of the chain, nearest first', () => {
		const found = matchingBranches('WALMART SUPERCENTER', [shop('Walmart Supercenter', 29.9), shop('Kroger', 29.71), shop('Walmart Supercenter', 29.75)], centre);
		expect(found.map((b) => b.lat)).toEqual([29.75, 29.9]);
	});
});

describe('shopsFrom', () => {
	it('reads nodes and building centres, with an address only when a street is tagged', () => {
		const shops = shopsFrom({
			elements: [
				{ lat: 29.7, lon: -95.5, tags: { name: 'Parivar Grocers', 'addr:housenumber': '11811', 'addr:street': 'Bissonnet St', 'addr:city': 'Houston', 'addr:state': 'TX', 'addr:postcode': '77099' } },
				{ center: { lat: 29.8, lon: -95.4 }, tags: { brand: 'H-E-B' } },
				{ lat: 29.85, lon: -95.45, tags: { name: 'Kroger', 'addr:full': 'Kroger, Main Street, Houston, Texas' } },
				{ lat: 29.9, lon: -95.3, tags: {} },
				{ tags: { name: 'No point' } }
			]
		});
		expect(shops).toEqual([
			{ name: 'Parivar Grocers', brand: null, lat: 29.7, lng: -95.5, address: '11811 Bissonnet St, Houston, TX 77099' },
			{ name: null, brand: 'H-E-B', lat: 29.8, lng: -95.4, address: null },
			{ name: 'Kroger', brand: null, lat: 29.85, lng: -95.45, address: 'Kroger, Main Street, Houston, Texas' }
		]);
		expect(shopsFrom(null)).toEqual([]);
	});
});

describe('addressesIn', () => {
	it('finds street addresses however a page writes them', () => {
		const text = 'Parivar Grocers | 11920 Bissonnet St, Houston, TX 77099. Call us. Also at 2010 S. Mason Rd Suite 100, Katy, TX 77450 and 2010 S. Mason Rd Suite 100, Katy, TX 77450.';
		expect(addressesIn(text)).toEqual(['11920 Bissonnet St, Houston, TX 77099', '2010 S. Mason Rd Suite 100, Katy, TX 77450']);
	});

	it('skips numbers that are not addresses', () => {
		expect(addressesIn('Open 9 to 9. Call 713 555 0101. Rated 4.5 by 120 people.')).toEqual([]);
	});
});

describe('photonPlaces', () => {
	const feature = (props: Record<string, unknown>, lat = 29.71, lng = -95.5) => ({ geometry: { coordinates: [lng, lat] }, properties: { countrycode: 'US', ...props } });

	it('writes a street address a geocoder can place, nearest first', () => {
		const answer = {
			features: [
				feature({ housenumber: '9', street: 'Far Road', city: 'Houston', state: 'Texas', postcode: '77001' }, 29.9),
				feature({ name: 'Parivar Grocers', housenumber: '6006', street: 'Hillcroft Avenue', city: 'Houston', state: 'Texas', postcode: '77081' })
			]
		};
		expect(photonPlaces(answer, centre).map((p) => [p.name, p.address])).toEqual([
			['Parivar Grocers', '6006 Hillcroft Avenue, Houston, Texas 77081'],
			[null, '9 Far Road, Houston, Texas 77001']
		]);
	});

	it('drops places outside the US, without a street, or too far to drive', () => {
		const answer = {
			features: [
				feature({ countrycode: 'MX', street: 'Calle 5' }),
				feature({ name: 'Houston', city: 'Houston' }),
				feature({ street: 'Main Street', city: 'Dallas' }, 32.78, -96.8)
			]
		};
		expect(photonPlaces(answer, centre)).toEqual([]);
	});

	it('fills a street found without the house with the number typed', () => {
		const answer = { features: [feature({ type: 'street', name: 'Westheimer Road', city: 'Houston', state: 'Texas', postcode: '77006' })] };
		expect(photonPlaces(answer, centre, '1200 westheim')[0]).toMatchObject({ name: null, address: '1200 Westheimer Road, Houston, Texas 77006' });
		expect(photonPlaces(answer, centre, 'westheim')[0].address).toBe('Westheimer Road, Houston, Texas 77006');
	});

	it('gives nothing for an answer that is not Photon’s', () => {
		expect(photonPlaces(null, centre)).toEqual([]);
		expect(photonPlaces({ features: [{}] }, centre)).toEqual([]);
	});
});
