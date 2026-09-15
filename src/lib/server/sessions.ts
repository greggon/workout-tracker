import { and, desc, eq, inArray } from 'drizzle-orm';
import type { SessionInput } from '$lib/session-payload';
import type { DayKey, Tool } from '$lib/types';
import { setVolume } from '$lib/volume';
import type { Db } from './db/client';
import { dayExercises, days, movements, sessions, setLogs } from './db/schema';

/**
 * Accepting and summarising a finished workout.
 *
 * Volume is summed in JavaScript from the stored logs rather than in SQL, so
 * the dumbbell-counts-double rule lives in exactly one place. The row counts
 * are trivial — a session is a few dozen sets.
 */

export type SaveOutcome = { created: boolean };

export class SessionError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'SessionError';
	}
}

/**
 * Stores a finished session, once.
 *
 * A replayed payload is accepted and ignored rather than rewritten: the sync
 * queue retries whenever it cannot tell whether a request landed, and the
 * second copy carries the same data by construction. Rewriting would risk
 * clobbering a correction made since.
 */
export function saveSession(db: Db, userId: string, input: SessionInput): SaveOutcome {
	return db.transaction((tx) => {
		const existing = tx
			.select({ id: sessions.id, userId: sessions.userId })
			.from(sessions)
			.where(eq(sessions.id, input.id))
			.get();

		if (existing) {
			// Someone else's session id is not ours to touch or to confirm.
			if (existing.userId !== userId) throw new SessionError(409, 'Session id already in use');
			return { created: false };
		}

		const day = tx
			.select()
			.from(days)
			.where(and(eq(days.id, input.dayId), eq(days.userId, userId)))
			.get();
		if (!day) throw new SessionError(404, 'No such day');

		// Exercise references must belong to this day; a stale or forged id
		// would otherwise attach history to someone else's routine row.
		const ownExercises = new Set(
			tx
				.select({ id: dayExercises.id })
				.from(dayExercises)
				.where(eq(dayExercises.dayId, day.id))
				.all()
				.map((r) => r.id)
		);

		const movementIds = [...new Set(input.logs.map((l) => l.movementId))];
		const knownMovements = new Set(
			tx
				.select({ id: movements.id })
				.from(movements)
				.where(inArray(movements.id, movementIds))
				.all()
				.map((r) => r.id)
		);
		for (const id of movementIds) {
			if (!knownMovements.has(id)) throw new SessionError(400, `Unknown movement ${id}`);
		}

		const endedAt = new Date(input.endedAt);
		const startedAt = new Date(input.startedAt);
		const durationMins = Math.max(1, Math.round((input.endedAt - input.startedAt) / 60_000));

		tx.insert(sessions)
			.values({
				id: input.id,
				userId,
				dayId: day.id,
				dayKey: day.key,
				dayTitle: day.title,
				startedAt,
				endedAt,
				durationMins,
				syncedAt: new Date()
			})
			.run();

		tx.insert(setLogs)
			.values(
				input.logs.map((log) => ({
					sessionId: input.id,
					dayExerciseId:
						log.dayExerciseId && ownExercises.has(log.dayExerciseId) ? log.dayExerciseId : null,
					movementId: log.movementId,
					exerciseIndex: log.exerciseIndex,
					setIndex: log.setIndex,
					slot: log.slot,
					tool: log.tool,
					weight: log.weight,
					reps: log.reps,
					loggedAt: new Date(log.loggedAt)
				}))
			)
			.run();

		return { created: true };
	});
}

export type SummaryRow = {
	movementId: string;
	name: string;
	tool: Tool;
	sets: number;
	reps: number;
	weight: number;
	volume: number;
};

export type HistoryPoint = {
	startedAt: number;
	volume: number;
	/** True for the session being summarised. */
	current: boolean;
};

export type SessionSummary = {
	id: string;
	dayKey: DayKey;
	dayTitle: string;
	startedAt: number;
	durationMins: number;
	volume: number;
	setCount: number;
	rows: SummaryRow[];
	/** This session plus the last few of the same day, oldest first. */
	history: HistoryPoint[];
	/** Volume of the previous same-day session, for the delta. */
	previousVolume: number | null;
};

/** How many earlier same-day sessions the summary chart shows. */
const HISTORY_SESSIONS = 4;

export function summarizeSession(db: Db, userId: string, sessionId: string): SessionSummary {
	const session = db
		.select()
		.from(sessions)
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
		.get();
	if (!session) throw new SessionError(404, 'No such session');

	const logs = db
		.select({
			movementId: setLogs.movementId,
			name: movements.name,
			tool: setLogs.tool,
			weight: setLogs.weight,
			reps: setLogs.reps
		})
		.from(setLogs)
		.innerJoin(movements, eq(movements.id, setLogs.movementId))
		.where(eq(setLogs.sessionId, sessionId))
		.all();

	const byMovement = new Map<string, SummaryRow>();
	for (const log of logs) {
		const row = byMovement.get(log.movementId) ?? {
			movementId: log.movementId,
			name: log.name,
			tool: log.tool,
			sets: 0,
			reps: 0,
			weight: log.weight,
			volume: 0
		};
		row.sets += 1;
		row.reps += log.reps;
		row.volume += setVolume({ tool: log.tool, weight: log.weight }, log.reps);
		byMovement.set(log.movementId, row);
	}

	const rows = [...byMovement.values()].sort((a, b) => b.volume - a.volume);
	const volume = rows.reduce((sum, r) => sum + r.volume, 0);

	// Earlier sessions of the same day letter, newest first, then flipped so the
	// chart reads left to right.
	const earlier = db
		.select({ id: sessions.id, startedAt: sessions.startedAt })
		.from(sessions)
		.where(and(eq(sessions.userId, userId), eq(sessions.dayKey, session.dayKey)))
		.orderBy(desc(sessions.startedAt))
		.limit(HISTORY_SESSIONS + 1)
		.all()
		.filter((s) => s.id !== sessionId)
		.slice(0, HISTORY_SESSIONS);

	const earlierVolumes = volumesFor(
		db,
		earlier.map((s) => s.id)
	);

	const history: HistoryPoint[] = earlier
		.map((s) => ({
			startedAt: s.startedAt.getTime(),
			volume: earlierVolumes.get(s.id) ?? 0,
			current: false
		}))
		.reverse();
	history.push({ startedAt: session.startedAt.getTime(), volume, current: true });

	return {
		id: session.id,
		dayKey: session.dayKey,
		dayTitle: session.dayTitle,
		startedAt: session.startedAt.getTime(),
		durationMins: session.durationMins,
		volume,
		setCount: logs.length,
		rows,
		history,
		previousVolume: history.length > 1 ? history[history.length - 2].volume : null
	};
}

function volumesFor(db: Db, sessionIds: string[]): Map<string, number> {
	const totals = new Map<string, number>();
	if (sessionIds.length === 0) return totals;

	const rows = db
		.select({
			sessionId: setLogs.sessionId,
			tool: setLogs.tool,
			weight: setLogs.weight,
			reps: setLogs.reps
		})
		.from(setLogs)
		.where(inArray(setLogs.sessionId, sessionIds))
		.all();

	for (const row of rows) {
		totals.set(
			row.sessionId,
			(totals.get(row.sessionId) ?? 0) + setVolume({ tool: row.tool, weight: row.weight }, row.reps)
		);
	}
	return totals;
}
