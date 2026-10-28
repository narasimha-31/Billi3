import { describe, expect, it, vi } from 'vitest';
import {
	AuthApiError,
	AuthInvalidJwtError,
	AuthPKCECodeVerifierMissingError,
	AuthRetryableFetchError,
	AuthSessionMissingError,
	type SupabaseClient
} from '@supabase/supabase-js';
import { currentUser, firstNameOf, signInWithCode, type User } from './session.server';

function clientReturning(result: { user: unknown; error: unknown }) {
	return {
		auth: {
			getClaims: async () => ({ data: result.user ? { claims: result.user } : null, error: result.error }),
			exchangeCodeForSession: async () => ({ data: {}, error: result.error })
		}
	} as unknown as SupabaseClient;
}

describe('currentUser', () => {
	it('returns the user from a valid token', async () => {
		const claims = { sub: 'u1', email: 'a@b.test', user_metadata: { full_name: 'Sam Lee' } };
		expect(await currentUser(clientReturning({ user: claims, error: null }))).toEqual({ id: 'u1', email: 'a@b.test', user_metadata: { full_name: 'Sam Lee' }, guest: false });
	});

	it('treats no session as signed out', async () => {
		expect(await currentUser(clientReturning({ user: null, error: null }))).toBeNull();
	});

	it('treats a token with a bad signature as signed out', async () => {
		const client = clientReturning({ user: null, error: new AuthInvalidJwtError('Invalid JWT signature') });
		expect(await currentUser(client)).toBeNull();
	});

	it('treats a missing session as signed out', async () => {
		const client = clientReturning({ user: null, error: new AuthSessionMissingError() });
		expect(await currentUser(client)).toBeNull();
	});

	it('treats a forged or revoked token as signed out', async () => {
		const client = clientReturning({
			user: null,
			error: new AuthApiError('invalid JWT', 403, 'bad_jwt')
		});
		expect(await currentUser(client)).toBeNull();
	});

	it('throws when supabase itself is failing', async () => {
		const outage = new AuthApiError('upstream down', 503, undefined);
		await expect(currentUser(clientReturning({ user: null, error: outage }))).rejects.toBe(outage);
	});

	it('throws when supabase is unreachable', async () => {
		const offline = new AuthRetryableFetchError('fetch failed', 0);
		await expect(currentUser(clientReturning({ user: null, error: offline }))).rejects.toBe(
			offline
		);
	});
});

describe('signInWithCode', () => {
	it('succeeds for a valid code', async () => {
		expect(await signInWithCode(clientReturning({ user: null, error: null }), 'c')).toBe(true);
	});

	it('fails cleanly when the code was opened in another browser', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const client = clientReturning({ user: null, error: new AuthPKCECodeVerifierMissingError() });
		expect(await signInWithCode(client, 'secret-code')).toBe(false);
		expect(warn).toHaveBeenCalledWith('sign-in code rejected:', 'pkce_code_verifier_not_found');
		expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-code');
		warn.mockRestore();
	});

	it('fails cleanly for a used or made-up code', async () => {
		const client = clientReturning({
			user: null,
			error: new AuthApiError('invalid flow state', 404, 'flow_state_not_found')
		});
		expect(await signInWithCode(client, 'c')).toBe(false);
	});

	it('throws when supabase is unreachable', async () => {
		const offline = new AuthRetryableFetchError('fetch failed', 0);
		await expect(signInWithCode(clientReturning({ user: null, error: offline }), 'c')).rejects.toBe(
			offline
		);
	});
});

describe('firstNameOf', () => {
	const user = (meta: Record<string, unknown>) => ({ user_metadata: meta }) as unknown as User;

	it('prefers the given name, then the first word of the full name', () => {
		expect(firstNameOf(user({ given_name: 'Maria', full_name: 'Ana Lopez' }))).toBe('Maria');
		expect(firstNameOf(user({ full_name: 'Ana Lopez' }))).toBe('Ana');
		expect(firstNameOf(user({ name: 'Sam Lee' }))).toBe('Sam');
	});

	it('returns nothing for missing or odd metadata', () => {
		expect(firstNameOf(user({}))).toBeNull();
		expect(firstNameOf(user({ given_name: 42 }))).toBeNull();
		expect(firstNameOf(user({ full_name: '' }))).toBeNull();
	});
});
