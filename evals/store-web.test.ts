import { expect, it } from 'vitest';
import { storeOnWeb } from '../src/web-lookup.server';

// a small shop missing from OpenStreetMap, found on the web near the sample shopper's ZIP (one search)
it('finds Parivar Grocers on Harwin Drive, once', async () => {
	const places = await storeOnWeb('Parivar Grocers', { lat: 29.7568, lng: -95.3634 }, null);
	expect(places.filter((p) => /harwin/i.test(p.address))).toHaveLength(1);
}, 30000);
