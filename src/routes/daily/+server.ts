import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findRecalls } from '../../daily-lookups.server';
import { findHealthyFoods } from '../../healthy-foods.server';
import { dropOldGuests } from '../../guest.server';
import type { RequestHandler } from './$types';

// compared as hashes, so the time taken says nothing about the secret
const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

// Vercel's daily cron, which sends the shared secret. Without the secret set, nothing runs.
export const GET: RequestHandler = async ({ request, url }) => {
	const secret = env.CRON_SECRET;
	if (!secret) error(401, 'Not allowed');
	const [sent, wanted] = await Promise.all([digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`)]);
	if (!sent.every((byte, i) => byte === wanted[i])) error(401, 'Not allowed');
	// ?day=2026-10-20 runs that day's healthy topic, to fill the list when it starts out empty
	const day = url.searchParams.get('day');
	const [recalls, healthy, guestsDropped] = await Promise.all([findRecalls(), findHealthyFoods(day && !Number.isNaN(Date.parse(day)) ? new Date(day) : undefined), dropOldGuests()]);
	return json({ recalls, healthy, guestsDropped });
};
