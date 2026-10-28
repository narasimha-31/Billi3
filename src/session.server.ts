import {
	AuthInvalidJwtError,
	isAuthApiError,
	isAuthPKCECodeVerifierMissingError,
	isAuthSessionMissingError,
	type SupabaseClient,
	type UserMetadata
} from '@supabase/supabase-js';

// guest is set by the server alone (app metadata), so no one can make themselves one or stop being one
export type User = { id: string; email: string | null; user_metadata: UserMetadata; guest: boolean };

// Bad, expired, forged or replayed credentials mean "not signed in".
// Anything else (Supabase down, network failure) is a real error and is thrown.
function isRejectedCredential(error: unknown) {
	return (
		isAuthSessionMissingError(error) ||
		isAuthPKCECodeVerifierMissingError(error) ||
		error instanceof AuthInvalidJwtError ||
		(isAuthApiError(error) && error.status >= 400 && error.status < 500)
	);
}

// getClaims checks the token's signature against the project's public keys, so a page load needs no
// round trip to Supabase; getSession alone would trust the cookie.
// shortcut: a token signed out on another device stays valid until it expires (an hour at most)
export async function currentUser(supabase: SupabaseClient): Promise<User | null> {
	const { data, error } = await supabase.auth.getClaims();
	if (error) {
		if (isRejectedCredential(error)) return null;
		throw error;
	}
	if (!data) return null;
	const { sub, email, user_metadata, app_metadata } = data.claims;
	return { id: sub, email: email ?? null, user_metadata: user_metadata ?? {}, guest: app_metadata?.guest === true };
}

export async function signInWithCode(supabase: SupabaseClient, code: string): Promise<boolean> {
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	if (!error) return true;
	if (isRejectedCredential(error)) {
		// the reason only, never the code: a missing verifier means the flow started on another origin
		console.warn('sign-in code rejected:', error.code ?? error.name);
		return false;
	}
	throw error;
}

export function firstNameOf(user: User): string | null {
	const meta = user.user_metadata ?? {};
	const name = meta.given_name ?? meta.full_name?.split(' ')[0] ?? meta.name?.split(' ')[0];
	return typeof name === 'string' && name ? name : null;
}
