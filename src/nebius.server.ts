import { NEBIUS_API_KEY } from '$env/static/private';
import { admin } from './admin.server';
import { GUEST_LIMIT_NOTES, MODELS, costMicros, guestLimit, overDailyCap, overNewAccountsCap, overUserCap, type ModelRole } from './ai-budget';

const BASE_URL = 'https://api.tokenfactory.nebius.com/v1';

if (NEBIUS_API_KEY.length < 20) throw new Error('NEBIUS_API_KEY is missing or too short');

// the provider is down, slow or unreachable, or (budget) the daily AI budget is spent; a note is
// what to tell the person when the usual "try again later" would be false hope
export class AiUnavailable extends Error {
	constructor(
		message: string,
		readonly budget = false,
		readonly note: string | null = null
	) {
		super(message);
	}
}

// The model answered, but with nothing usable: cut off at the token limit or not JSON. The provider
// is up, so this is no outage; another model, or a better photo, may still do.
export class BadAnswer extends Error {}

type Message = { role: 'system' | 'user'; content: string | unknown[] };
type Request = { role: ModelRole; purpose: string; userId: string | null; messages: Message[]; schema: object; maxTokens?: number };

// today's spend for everyone, and for this person, summed by the database
async function spentToday(userId: string | null) {
	const { data, error } = await admin.rpc('ai_spent_today', { p_user_id: userId });
	if (error) throw error;
	const row = (data as { all_micros: number; user_micros: number; new_micros: number; user_is_new: boolean; guest_micros: number; user_is_guest: boolean; ever_micros: number }[])[0];
	return {
		all: Number(row?.all_micros ?? 0),
		mine: Number(row?.user_micros ?? 0),
		fresh: Number(row?.new_micros ?? 0),
		isNew: !!row?.user_is_new,
		guests: Number(row?.guest_micros ?? 0),
		isGuest: !!row?.user_is_guest,
		ever: Number(row?.ever_micros ?? 0)
	};
}

// Whether this model's last call in the past three minutes failed. A model that is down then
// gets skipped instead of making every person wait for its limit, and after three quiet
// minutes one read tries it again, so we switch back on our own once it recovers.
const COOL_DOWN_MS = 3 * 60_000;

export async function recentlyFailed(role: ModelRole) {
	const { data, error } = await admin
		.from('ai_calls')
		.select('ok')
		.eq('model', MODELS[role].id)
		.gt('created_at', new Date(Date.now() - COOL_DOWN_MS).toISOString())
		.order('created_at', { ascending: false })
		.limit(1);
	if (error) throw error;
	return data.length > 0 && !data[0].ok;
}

// no answer in time, or no connection at all, counts as the provider being down; a timeout
// is not retried, since waiting twice would leave the person sitting there far too long
async function post(body: object, deadline: number, path = 'chat/completions') {
	try {
		return await fetch(`${BASE_URL}/${path}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${NEBIUS_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(Math.max(0, deadline - Date.now()))
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === 'TimeoutError') throw new AiUnavailable('provider timed out');
		if (error instanceof TypeError) throw new AiUnavailable(`provider unreachable: ${error.message}`);
		throw error;
	}
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };

// for a guest, why reading is closed to every guest right now, before they add a photo
export async function guestsClosed(userId: string) {
	const spent = await spentToday(userId);
	const limit = spent.isGuest ? guestLimit(spent.guests, spent.ever) : null;
	return limit ? GUEST_LIMIT_NOTES[limit] : null;
}

async function checkBudget(userId: string | null) {
	const spent = await spentToday(userId);
	if (spent.isGuest) {
		const limit = guestLimit(spent.guests, spent.ever);
		if (limit) throw new AiUnavailable(`guest ${limit} limit reached`, true, GUEST_LIMIT_NOTES[limit]);
		if (overUserCap(spent.mine)) throw new AiUnavailable('daily AI budget for this guest reached', true, "You've used your guest reads for today. Everything you added is still here to explore.");
		return;
	}
	if (overDailyCap(spent.all)) throw new AiUnavailable('daily AI budget reached', true);
	if (overUserCap(spent.mine)) throw new AiUnavailable('daily AI budget for this person reached', true);
	if (overNewAccountsCap(spent.isNew, spent.fresh)) throw new AiUnavailable('daily AI budget for new accounts reached', true);
}

async function logCall(role: ModelRole, purpose: string, userId: string | null, usage: Usage, started: number, ok: boolean, servedModel: string | null) {
	const { error } = await admin.from('ai_calls').insert({
		user_id: userId,
		model: MODELS[role].id,
		served_model: servedModel,
		purpose,
		input_tokens: usage.prompt_tokens ?? 0,
		output_tokens: usage.completion_tokens ?? 0,
		cost_micros: costMicros(role, usage),
		duration_ms: Date.now() - started,
		ok
	});
	if (error) console.error('ai call log failed', error.message);
}

// A server error or rate limit gets one more try after a short wait, but both tries share one
// hard limit: the retry only happens if a fair chance at an answer is left inside it.
const RETRY_WAIT_MS = 1500;
const RETRY_NEEDS_MS = 4000;

async function postWithRetry(body: object, seconds: number, path?: string) {
	const deadline = Date.now() + seconds * 1000;
	let response = await post(body, deadline, path);
	if ((response.status === 429 || response.status >= 500) && deadline - Date.now() > RETRY_WAIT_MS + RETRY_NEEDS_MS) {
		await new Promise((wait) => setTimeout(wait, RETRY_WAIT_MS));
		response = await post(body, deadline, path);
	}
	if (response.status === 429 || response.status >= 500) throw new AiUnavailable(`provider returned ${response.status}`);
	// the account's credit is spent: like our own cap, receipts wait instead of failing
	if (response.status === 402) throw new AiUnavailable('provider credit is spent', true);
	if (!response.ok) throw new Error(`provider rejected the request: ${response.status}`);
	return response;
}

// one vector per text, in the same order
export async function embed({ purpose, userId, texts }: { purpose: string; userId: string | null; texts: string[] }): Promise<number[][]> {
	await checkBudget(userId);
	const started = Date.now();
	let usage: Usage = {};
	let ok = false;
	try {
		const response = await postWithRetry({ model: MODELS.embed.id, input: texts, dimensions: 1024 }, MODELS.embed.seconds, 'embeddings');
		const json = await response.json();
		usage = json.usage ?? {};
		const vectors = (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
		if (vectors.length !== texts.length || vectors.some((v) => v.length !== 1024)) throw new Error('embedding answer has the wrong shape');
		ok = true;
		return vectors;
	} finally {
		await logCall('embed', purpose, userId, usage, started, ok, null);
	}
}

// One structured call. reasoning_effort "none" matters: with reasoning on, Nemotron ignores
// response_format and bills the reasoning, so strict JSON (our injection defence) breaks.
export async function structured<T>({ role, purpose, userId, messages, schema, maxTokens = 2000 }: Request): Promise<T> {
	await checkBudget(userId);

	const body = {
		model: MODELS[role].id,
		messages,
		temperature: 0,
		max_tokens: maxTokens,
		reasoning_effort: 'none',
		response_format: { type: 'json_schema', json_schema: { name: purpose, schema, strict: true } }
	};

	const started = Date.now();
	let usage: Usage = {};
	let ok = false;
	let servedModel: string | null = null;
	try {
		const response = await postWithRetry(body, MODELS[role].seconds);
		const json = await response.json();
		usage = json.usage ?? {};
		servedModel = typeof json.model === 'string' ? json.model.slice(0, 100) : null;
		// logged ok: the outage check reads it, and the provider did answer
		ok = true;
		try {
			return JSON.parse(json.choices?.[0]?.message?.content ?? '') as T;
		} catch {
			throw new BadAnswer(`unusable answer (${json.choices?.[0]?.finish_reason ?? 'no finish reason'})`);
		}
	} finally {
		await logCall(role, purpose, userId, usage, started, ok, servedModel);
	}
}
