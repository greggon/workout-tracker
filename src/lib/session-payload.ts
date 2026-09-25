import { TOOLS, type Tool } from './types';

/**
 * The wire shape of a finished workout.
 *
 * Shared between the client that builds it and the server that accepts it, so
 * the two cannot drift. `id` is minted when the workout starts and is the
 * idempotency key: the sync queue may replay this payload any number of times.
 */

export type SetLogInput = {
	/** Null when the routine row has since been edited away. */
	dayExerciseId: string | null;
	movementId: string;
	exerciseIndex: number;
	setIndex: number;
	slot: number;
	tool: Tool;
	weight: number;
	reps: number;
	/** Epoch milliseconds. */
	loggedAt: number;
};

export type SessionInput = {
	id: string;
	dayId: string;
	startedAt: number;
	endedAt: number;
	/**
	 * Time the workout spent paused, which the stored duration leaves out. The
	 * two timestamps stay the real start and end. Optional: sessions queued
	 * offline before pausing existed do not carry it.
	 */
	pausedMs?: number;
	logs: SetLogInput[];
};

/** A day of sets, with room to spare. Anything larger is a bug or an attack. */
export const MAX_LOGS = 600;
/** Nobody does a thousand reps in a set. */
const MAX_REPS = 1000;
const MAX_WEIGHT = 10_000;

export type ParseResult = { ok: true; value: SessionInput } | { ok: false; error: string };

function isId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function isCount(value: unknown, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validates an untrusted body. Returns a message rather than throwing, because
 * the caller answers 400 with it — and a rejected session is a lost workout, so
 * the reason needs to survive to the client.
 */
export function parseSessionPayload(body: unknown): ParseResult {
	if (!body || typeof body !== 'object') return { ok: false, error: 'Expected an object' };
	const raw = body as Record<string, unknown>;

	if (!isId(raw.id)) return { ok: false, error: 'Missing session id' };
	if (!isId(raw.dayId)) return { ok: false, error: 'Missing day id' };
	if (!isTimestamp(raw.startedAt) || !isTimestamp(raw.endedAt)) {
		return { ok: false, error: 'Missing or invalid timestamps' };
	}
	if (raw.endedAt < raw.startedAt) return { ok: false, error: 'Session ended before it started' };
	const pausedMs = raw.pausedMs;
	if (
		pausedMs !== undefined &&
		(typeof pausedMs !== 'number' ||
			!Number.isFinite(pausedMs) ||
			pausedMs < 0 ||
			pausedMs > raw.endedAt - raw.startedAt)
	) {
		return { ok: false, error: 'Invalid paused time' };
	}
	if (!Array.isArray(raw.logs)) return { ok: false, error: 'Missing logs' };
	if (raw.logs.length === 0) return { ok: false, error: 'A session needs at least one set' };
	if (raw.logs.length > MAX_LOGS) return { ok: false, error: `More than ${MAX_LOGS} sets` };

	const logs: SetLogInput[] = [];
	const seen = new Set<string>();

	for (const [i, entry] of raw.logs.entries()) {
		if (!entry || typeof entry !== 'object')
			return { ok: false, error: `Log ${i} is not an object` };
		const log = entry as Record<string, unknown>;

		if (!isId(log.movementId)) return { ok: false, error: `Log ${i} has no movement` };
		if (log.dayExerciseId != null && !isId(log.dayExerciseId)) {
			return { ok: false, error: `Log ${i} has an invalid exercise id` };
		}
		if (typeof log.tool !== 'string' || !(TOOLS as readonly string[]).includes(log.tool)) {
			return { ok: false, error: `Log ${i} has an unknown tool` };
		}
		if (!isCount(log.exerciseIndex, 100) || !isCount(log.setIndex, 100) || !isCount(log.slot, 1)) {
			return { ok: false, error: `Log ${i} has an invalid position` };
		}
		if (!isCount(log.reps, MAX_REPS)) return { ok: false, error: `Log ${i} has invalid reps` };
		if (
			typeof log.weight !== 'number' ||
			!Number.isFinite(log.weight) ||
			log.weight < 0 ||
			log.weight > MAX_WEIGHT
		) {
			return { ok: false, error: `Log ${i} has an invalid weight` };
		}
		if (!isTimestamp(log.loggedAt)) return { ok: false, error: `Log ${i} has no timestamp` };

		// The database enforces this too, but a duplicate slot means the client
		// built the payload wrong and the whole session is suspect.
		const slot = `${log.exerciseIndex}|${log.setIndex}|${log.slot}`;
		if (seen.has(slot)) return { ok: false, error: `Log ${i} repeats slot ${slot}` };
		seen.add(slot);

		logs.push({
			dayExerciseId: (log.dayExerciseId as string | null) ?? null,
			movementId: log.movementId,
			exerciseIndex: log.exerciseIndex,
			setIndex: log.setIndex,
			slot: log.slot,
			tool: log.tool as Tool,
			weight: log.weight,
			reps: log.reps,
			loggedAt: log.loggedAt
		});
	}

	return {
		ok: true,
		value: {
			id: raw.id,
			dayId: raw.dayId,
			startedAt: raw.startedAt,
			endedAt: raw.endedAt,
			...(pausedMs ? { pausedMs } : {}),
			logs
		}
	};
}
