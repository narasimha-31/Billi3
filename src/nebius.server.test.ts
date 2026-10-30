import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_DAILY_CAP_MICROS } from './ai-budget';
import { AiUnavailable, BadAnswer, embed, structured } from './nebius.server';

const spent = vi.hoisted(() => ({ all_micros: 0, user_micros: 0 }));
vi.mock('./admin.server', () => ({
	admin: {
		rpc: async () => ({ data: [spent], error: null }),
		from: () => ({ insert: async () => ({ error: null }) })
	}
}));

const call = () => structured({ role: 'names', purpose: 'test', userId: null, messages: [{ role: 'user', content: 'hi' }], schema: {} });
const answer = (status: number, body: object = {}) => new Response(JSON.stringify(body), { status });

afterEach(() => {
	vi.unstubAllGlobals();
	Object.assign(spent, { all_micros: 0, user_micros: 0 });
});

describe('structured', () => {
	it('treats a timeout as the provider being unavailable, without retrying', async () => {
		const fetch = vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
		vi.stubGlobal('fetch', fetch);
		await expect(call()).rejects.toBeInstanceOf(AiUnavailable);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('treats a failed connection as unavailable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
		await expect(call()).rejects.toBeInstanceOf(AiUnavailable);
	});

	it('retries a server error once, then gives up as unavailable', async () => {
		const fetch = vi.fn().mockResolvedValue(answer(503));
		vi.stubGlobal('fetch', fetch);
		await expect(call()).rejects.toBeInstanceOf(AiUnavailable);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('skips the retry when the error came too late to fit another try inside the limit', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetch = vi.fn().mockImplementation(async () => {
			vi.setSystemTime(Date.now() + 8000);
			return answer(503);
		});
		vi.stubGlobal('fetch', fetch);
		await expect(call()).rejects.toBeInstanceOf(AiUnavailable);
		expect(fetch).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it('calls an answer cut off at the token limit a bad answer, not an outage', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { choices: [{ message: { content: '{"lines": [{"raw": "OKRA' }, finish_reason: 'length' }] })));
		const error = await call().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(BadAnswer);
		expect(error).not.toBeInstanceOf(AiUnavailable);
	});

	it('reports a rejected request as a real error, not an outage', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(422)));
		const error = await call().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(AiUnavailable);
	});

	it('treats a retired model as down, so the backup can take over', async () => {
		const fetch = vi.fn().mockResolvedValue(answer(404));
		vi.stubGlobal('fetch', fetch);
		await expect(call()).rejects.toBeInstanceOf(AiUnavailable);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('treats spent provider credit as the budget running out, so receipts wait', async () => {
		const fetch = vi.fn().mockResolvedValue(answer(402));
		vi.stubGlobal('fetch', fetch);
		await expect(call()).rejects.toMatchObject({ budget: true });
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('refuses before calling out once the budget for the day, or for this person, is spent', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		spent.all_micros = 1_000_000;
		await expect(call()).rejects.toMatchObject({ budget: true });
		Object.assign(spent, { all_micros: USER_DAILY_CAP_MICROS, user_micros: USER_DAILY_CAP_MICROS });
		await expect(call()).rejects.toMatchObject({ budget: true, message: expect.stringContaining('person') });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('returns the parsed answer', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { model: 'm', usage: {}, choices: [{ message: { content: '{"ok":true}' } }] })));
		await expect(call()).resolves.toEqual({ ok: true });
	});
});

describe('embed', () => {
	const vector = (n: number) => Array.from({ length: 1024 }, () => n);
	const texts = ['Bananas', 'Whole milk'];

	it('returns one vector per text, in the order asked, whatever order they come back in', async () => {
		const fetch = vi.fn().mockResolvedValue(answer(200, { usage: { prompt_tokens: 4 }, data: [{ index: 1, embedding: vector(2) }, { index: 0, embedding: vector(1) }] }));
		vi.stubGlobal('fetch', fetch);
		const vectors = await embed({ purpose: 'test', userId: null, texts });
		expect(vectors.map((v) => v[0])).toEqual([1, 2]);
		expect(String(fetch.mock.calls[0][0])).toMatch(/\/embeddings$/);
		expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ input: texts, dimensions: 1024 });
	});

	it('refuses an answer with missing or wrong-sized vectors', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(200, { data: [{ index: 0, embedding: [1, 2, 3] }] })));
		await expect(embed({ purpose: 'test', userId: null, texts })).rejects.toThrow('wrong shape');
	});

	it('stays inside the daily budget', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		spent.all_micros = 1_000_000;
		await expect(embed({ purpose: 'test', userId: null, texts })).rejects.toMatchObject({ budget: true });
		expect(fetch).not.toHaveBeenCalled();
	});
});
