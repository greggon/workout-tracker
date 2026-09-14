import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import {
	ACCESS_JWT_HEADER,
	AuthError,
	accessIssuer,
	accessKeySet,
	verifyAccessToken,
	type VerifyOptions
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import { resolveUser } from '$lib/server/users';

/**
 * Every request is authenticated by Cloudflare Access before it reaches here.
 * This hook verifies that assertion and resolves it to an account.
 *
 * The dev bypass is gated on `dev`, which SvelteKit resolves at build time — it
 * is `false` in anything produced by `vite build`, so the bypass is not merely
 * unset in production, it is not present in the bundle at all.
 */

const devBypassEmail = dev ? env.AUTH_DEV_EMAIL?.trim().toLowerCase() : undefined;
let announcedBypass = false;

let cachedOptions: VerifyOptions | undefined;

function accessOptions(): VerifyOptions {
	if (cachedOptions) return cachedOptions;

	const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
	const audience = env.CF_ACCESS_AUD;
	if (!teamDomain || !audience) {
		// Fail closed and loudly. A missing config must never degrade to "allow".
		throw new Error(
			'Cloudflare Access is not configured: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD' +
				(dev ? ', or set AUTH_DEV_EMAIL to bypass Access while developing locally.' : '.')
		);
	}

	cachedOptions = {
		issuer: accessIssuer(teamDomain),
		audience,
		keys: accessKeySet(teamDomain)
	};
	return cachedOptions;
}

/**
 * A 401 the offline sync queue can recognise without guessing.
 *
 * When the *Access* session lapses, the client never sees this — Cloudflare
 * answers with a 302 to its login page and `fetch` follows it, yielding an HTML
 * body under a 200. The client therefore treats "expected JSON, got HTML" as an
 * auth failure too; this header is the unambiguous signal for the cases that do
 * reach us.
 */
function authRequired(reason: string): Response {
	return new Response(JSON.stringify({ error: 'unauthenticated', reason }), {
		status: 401,
		headers: {
			'content-type': 'application/json',
			'x-liftup-auth': 'required',
			'cache-control': 'no-store'
		}
	});
}

async function authenticate(request: Request): Promise<string> {
	if (devBypassEmail) {
		if (!announcedBypass) {
			announcedBypass = true;
			console.warn(`[auth] DEV BYPASS ACTIVE — every request is ${devBypassEmail}`);
		}
		return devBypassEmail;
	}

	const { email } = await verifyAccessToken(
		request.headers.get(ACCESS_JWT_HEADER),
		accessOptions()
	);
	return email;
}

export const handle: Handle = async ({ event, resolve }) => {
	let email: string;
	try {
		email = await authenticate(event.request);
	} catch (cause) {
		if (cause instanceof AuthError) {
			console.warn(
				`[auth] rejected ${event.request.method} ${event.url.pathname}: ${cause.reason}`
			);
			return authRequired(cause.reason);
		}
		throw cause; // misconfiguration — a 500 is correct and should be noisy
	}

	event.locals.user = resolveUser(db, email);
	return resolve(event);
};
