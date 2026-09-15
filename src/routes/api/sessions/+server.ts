import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { SessionError, saveSession, summarizeSession } from '$lib/server/sessions';
import { parseSessionPayload } from '$lib/session-payload';
import type { RequestHandler } from './$types';

/**
 * The only endpoint that accepts durable workout data.
 *
 * Idempotent on the client-generated session id: a replay returns 200 with the
 * same summary and `created: false`, so the sync queue can retry freely without
 * risking a duplicate session.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Body is not JSON' }, { status: 400 });
	}

	const parsed = parseSessionPayload(body);
	if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });

	const db = getDb();
	try {
		const { created } = saveSession(db, locals.user.id, parsed.value);
		const summary = summarizeSession(db, locals.user.id, parsed.value.id);
		return json({ created, summary }, { status: created ? 201 : 200 });
	} catch (cause) {
		if (cause instanceof SessionError) {
			return json({ error: cause.message }, { status: cause.status });
		}
		throw cause;
	}
};
