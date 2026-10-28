import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ TAVILY_API_KEY: 'tvly-test-key' as string | undefined }));
const logged = vi.hoisted(() => [] as unknown[]);
const today = vi.hoisted(() => ({ count: 0, guest: false, guests: 0 }));
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('./admin.server', () => {
	const counted = { eq: () => counted, gte: async () => ({ count: today.count, error: null }) };
	return {
		admin: {
			from: () => ({ insert: async (row: unknown) => (logged.push(row), { error: null }), select: () => counted }),
			rpc: async (name: string) => ({ data: name === 'is_guest' ? today.guest : today.guests, error: null })
		}
	};
});

import { GUEST_SEARCHES_ALL, GUEST_SEARCHES_PER_DAY, SEARCHES_PER_DAY, tavily } from './web-lookup.server';

afterEach(() => {
	vi.unstubAllGlobals();
	logged.length = 0;
	today.count = 0;
	today.guest = false;
	today.guests = 0;
	env.TAVILY_API_KEY = 'tvly-test-key';
});

const search = (userId: string | null) => tavily('Parivar Grocers Houston address', 3, 300, 'store_lookup', userId, AbortSignal.timeout(1000));

describe('tavily', () => {
	it('stops at the daily searches for a shopper, without calling out', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		today.count = SEARCHES_PER_DAY;
		expect(await search('user-1')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('stops a guest at the guest share, which is smaller', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		today.guest = true;
		today.count = GUEST_SEARCHES_PER_DAY;
		expect(await search('guest-1')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('stops every guest once guests together used the day', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		today.guest = true;
		today.guests = GUEST_SEARCHES_ALL;
		expect(await search('guest-1')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('keeps short results and logs what the search was for', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: 'Parivar Grocers', content: 'x'.repeat(500), url: 'https://a' }] })));
		vi.stubGlobal('fetch', fetch);
		expect(await search('user-1')).toEqual([{ title: 'Parivar Grocers', content: 'x'.repeat(300), url: 'https://a', published: null }]);
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ query: 'Parivar Grocers Houston address' });
		expect(logged).toMatchObject([{ model: 'tavily/search', purpose: 'store_lookup', ok: true }]);
	});

	it('gives nothing when the search fails, and logs the failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
		expect(await search(null)).toBeNull();
		expect(logged).toMatchObject([{ ok: false }]);
	});

	it('searches nothing without a key', async () => {
		env.TAVILY_API_KEY = undefined;
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(await search(null)).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
