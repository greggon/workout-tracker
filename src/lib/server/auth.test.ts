import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthError, accessCertsUrl, accessIssuer, verifyAccessToken } from './auth';

/**
 * Signs tokens with a throwaway keypair and verifies them against a local JWKS,
 * so every accept and reject path runs for real — no mocked verifier, and no
 * network. A stub that always returns `{ email }` would pass while proving
 * nothing about the part that actually matters.
 */

const ISSUER = 'https://testteam.cloudflareaccess.com';
const AUD = 'a'.repeat(64);

let keys: JWTVerifyGetKey;
let sign: (
	claims: Record<string, unknown>,
	opts?: { aud?: string; iss?: string }
) => Promise<string>;
let otherKeySign: () => Promise<string>;

beforeAll(async () => {
	const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
	const jwk = await exportJWK(publicKey);
	keys = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'test' }] });

	sign = (claims, opts = {}) =>
		new SignJWT(claims)
			.setProtectedHeader({ alg: 'RS256', kid: 'test' })
			.setIssuer(opts.iss ?? ISSUER)
			.setAudience(opts.aud ?? AUD)
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(privateKey);

	const impostor = await generateKeyPair('RS256', { extractable: true });
	otherKeySign = () =>
		new SignJWT({ email: 'attacker@example.com' })
			.setProtectedHeader({ alg: 'RS256', kid: 'test' })
			.setIssuer(ISSUER)
			.setAudience(AUD)
			.setIssuedAt()
			.setExpirationTime('1h')
			.sign(impostor.privateKey);
});

const options = () => ({ issuer: ISSUER, audience: AUD, keys });

async function reasonFor(token: string | null | undefined): Promise<string> {
	try {
		await verifyAccessToken(token, options());
	} catch (e) {
		return e instanceof AuthError ? e.reason : `unexpected:${(e as Error).name}`;
	}
	return 'accepted';
}

describe('accessIssuer', () => {
	it('expands a bare team name', () => {
		expect(accessIssuer('testteam')).toBe('https://testteam.cloudflareaccess.com');
	});

	it('accepts a full domain or URL, with or without trailing slash', () => {
		expect(accessIssuer('testteam.cloudflareaccess.com')).toBe(ISSUER);
		expect(accessIssuer('https://testteam.cloudflareaccess.com/')).toBe(ISSUER);
		expect(accessIssuer('  testteam.cloudflareaccess.com  ')).toBe(ISSUER);
	});

	it('rejects an empty team domain rather than building a bogus issuer', () => {
		expect(() => accessIssuer('   ')).toThrow(/empty/i);
	});

	it('points at the team certs endpoint', () => {
		expect(accessCertsUrl('testteam').toString()).toBe(`${ISSUER}/cdn-cgi/access/certs`);
	});
});

describe('verifyAccessToken', () => {
	it('accepts a well-formed assertion and returns the email', async () => {
		const token = await sign({ email: 'Greg@Example.com' });
		await expect(verifyAccessToken(token, options())).resolves.toEqual({
			email: 'greg@example.com' // normalised for the users.email lookup
		});
	});

	it('reports a missing assertion distinctly from an invalid one', async () => {
		expect(await reasonFor(null)).toBe('missing_token');
		expect(await reasonFor('')).toBe('missing_token');
		expect(await reasonFor(undefined)).toBe('missing_token');
	});

	it('rejects a token signed by a different key', async () => {
		expect(await reasonFor(await otherKeySign())).toBe('invalid_token');
	});

	it('rejects a token minted for another Access application', async () => {
		// The whole point of pinning the AUD tag: same team, same signing key,
		// different application.
		const token = await sign({ email: 'greg@example.com' }, { aud: 'b'.repeat(64) });
		expect(await reasonFor(token)).toBe('invalid_token');
	});

	it('rejects a token from another team', async () => {
		const token = await sign(
			{ email: 'greg@example.com' },
			{ iss: 'https://someone-else.cloudflareaccess.com' }
		);
		expect(await reasonFor(token)).toBe('invalid_token');
	});

	it('rejects an expired token', async () => {
		const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
		const jwk = await exportJWK(publicKey);
		const expired = await new SignJWT({ email: 'greg@example.com' })
			.setProtectedHeader({ alg: 'RS256', kid: 'test' })
			.setIssuer(ISSUER)
			.setAudience(AUD)
			.setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
			.setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
			.sign(privateKey);

		const localKeys = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', kid: 'test' }] });
		try {
			await verifyAccessToken(expired, { issuer: ISSUER, audience: AUD, keys: localKeys });
			expect.unreachable('expired token was accepted');
		} catch (e) {
			expect((e as AuthError).reason).toBe('invalid_token');
		}
	});

	it('rejects an unsigned "alg: none" token', async () => {
		const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
		const body = Buffer.from(
			JSON.stringify({ email: 'attacker@example.com', iss: ISSUER, aud: AUD })
		).toString('base64url');
		expect(await reasonFor(`${header}.${body}.`)).toBe('invalid_token');
	});

	it('rejects a verified token that carries no usable email', async () => {
		expect(await reasonFor(await sign({}))).toBe('missing_email');
		expect(await reasonFor(await sign({ email: '  ' }))).toBe('missing_email');
		expect(await reasonFor(await sign({ email: 42 }))).toBe('missing_email');
	});

	it('rejects opaque garbage', async () => {
		expect(await reasonFor('not-a-jwt')).toBe('invalid_token');
	});
});
