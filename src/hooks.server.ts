import { createServerClient } from '@supabase/ssr';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from '$env/static/public';
import { DISPLAY_COOKIE, htmlAttributes, readDisplay } from './display';
import { errorCode, logError, errorMessage } from './error-log.server';
import { currentUser } from './session.server';

if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(PUBLIC_SUPABASE_URL)) {
	throw new Error('PUBLIC_SUPABASE_URL must look like https://<project-ref>.supabase.co');
}
if (!PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
	throw new Error('PUBLIC_SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) {
					event.cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});

	event.locals.getUser = () => currentUser(event.locals.supabase);

	// the shopper's look is on the very first frame, so nothing jumps after load; read once the page's
	// loads have run, since the root layout may have found a newer look saved on the account
	let display: string | undefined;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			display ??= htmlAttributes(event.locals.display ?? readDisplay(event.cookies.get(DISPLAY_COOKIE)));
			return display ? html.replace('<html lang="en">', `<html lang="en" ${display}>`) : html;
		},
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
	// A signed-in page is never kept by the browser: after signing out, back can't show it again from
	// the page cache, and a shared computer keeps none of it.
	if (event.route.id && SIGNED_IN.test(event.route.id)) response.headers.set('cache-control', 'private, no-store');
	// no other site may frame a page, so no hidden clicks on our buttons
	response.headers.set('content-security-policy', "frame-ancestors 'none'");
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	return response;
};

const SIGNED_IN = /^\/(home|receipts|prices|list|settings|feedback|export|stores)(\/|$)/;

// Unexpected errors get a short reference the user can quote; the details go to error_log.
// Expected ones (404s and the like) are not logged.
export const handleError: HandleServerError = async ({ error, event, status }) => {
	if (status < 500) return { message: 'Not found' };

	const id = crypto.randomUUID();
	const userId = await event.locals.getUser?.().then((u) => u?.id ?? null).catch(() => null);
	await logError({
		id,
		route: event.route.id,
		status,
		message: errorMessage(error),
		code: errorCode(error),
		userId: userId ?? null
	});
	return { message: 'Something went wrong', ref: id.slice(0, 8) };
};
