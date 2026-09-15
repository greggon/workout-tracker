/**
 * How to read the server's answer to a queued session.
 *
 * Pure, because the interesting case is one that is easy to get wrong and hard
 * to reproduce: when the Cloudflare Access session lapses, the request is not
 * answered with a 401. Access replies with a redirect to its login page, fetch
 * follows it, and the client receives 200 OK carrying HTML. A client that
 * checks only `response.ok` marks the workout synced and drops it.
 */

export type SyncOutcome =
	/** Stored. Remove it from the queue. */
	| 'saved'
	/** Temporary. Keep it and try later. */
	| 'retry'
	/** Signed out. Keep it and ask the user to sign in. */
	| 'reauth'
	/** The server will never accept this payload. Keep it, but stop retrying. */
	| 'rejected';

export function classifyResponse(status: number, contentType: string | null): SyncOutcome {
	const isJson = (contentType ?? '').toLowerCase().includes('application/json');

	// Anything that is not JSON came from somewhere other than our API — in
	// practice, the Access login page arriving under someone else's 200.
	if (!isJson) return 'reauth';

	if (status === 401 || status === 403) return 'reauth';
	if (status >= 200 && status < 300) return 'saved';
	// 400 and 409 are verdicts about the payload itself; retrying cannot help.
	if (status >= 400 && status < 500 && status !== 408 && status !== 429) return 'rejected';
	return 'retry';
}

/** Exponential backoff, capped, so a long outage does not hammer the server. */
export function backoffMs(attempt: number): number {
	const base = 5_000 * 2 ** Math.max(0, attempt - 1);
	return Math.min(base, 5 * 60_000);
}
