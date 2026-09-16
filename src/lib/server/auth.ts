import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Cloudflare Access authentication.
 *
 * Access authenticates at the edge and forwards the request with a signed JWT.
 * We verify that signature ourselves rather than trusting the plaintext
 * `Cf-Access-Authenticated-User-Email` header Access also sets — that header is
 * forgeable by anything that can reach the Node process without traversing the
 * tunnel, which is the difference between multi-account and multi-costume.
 */

/** Access puts the signed assertion here. Header names arrive lowercased. */
export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';

export type AuthFailure =
	| 'missing_token' // no assertion header — request did not come through Access
	| 'invalid_token' // bad signature, wrong issuer/audience, or expired
	| 'missing_email'; // verified, but carries no usable email claim

export class AuthError extends Error {
	constructor(
		readonly reason: AuthFailure,
		message: string
	) {
		super(message);
		this.name = 'AuthError';
	}
}

/** Normalizes "team", "team.cloudflareaccess.com" or a full URL to an origin. */
export function accessIssuer(teamDomain: string): string {
	const host = teamDomain
		.trim()
		.replace(/^https?:\/\//, '')
		.replace(/\/+$/, '');
	if (!host) throw new Error('CF_ACCESS_TEAM_DOMAIN is empty');
	return `https://${host.includes('.') ? host : `${host}.cloudflareaccess.com`}`;
}

export function accessCertsUrl(teamDomain: string): URL {
	return new URL(`${accessIssuer(teamDomain)}/cdn-cgi/access/certs`);
}

/** jose caches and re-fetches the key set on its own; build this once per process. */
export function accessKeySet(teamDomain: string): JWTVerifyGetKey {
	return createRemoteJWKSet(accessCertsUrl(teamDomain));
}

export type VerifyOptions = {
	issuer: string;
	/**
	 * The per-application AUD tag. Without it, a token minted for any other
	 * application in the same Cloudflare team would verify here.
	 */
	audience: string;
	keys: JWTVerifyGetKey;
};

/**
 * Verifies an Access assertion and returns the identity it carries.
 * Throws AuthError for every rejection path; never returns a partial result.
 */
export async function verifyAccessToken(
	token: string | null | undefined,
	options: VerifyOptions
): Promise<{ email: string }> {
	if (!token) throw new AuthError('missing_token', 'No Cloudflare Access assertion on request');

	let payload;
	try {
		({ payload } = await jwtVerify(token, options.keys, {
			issuer: options.issuer,
			audience: options.audience
		}));
	} catch (cause) {
		throw new AuthError(
			'invalid_token',
			`Access assertion failed verification: ${(cause as Error).message}`
		);
	}

	const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (!email) throw new AuthError('missing_email', 'Access assertion carries no email claim');

	return { email };
}
