import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Tool } from '$lib/types';
import { setVolume } from '$lib/volume';
import type { Db } from './db/client';
import { movements, sessions, setLogs } from './db/schema';

/**
 * Per-movement history, aggregated from raw `set_logs`.
 *
 * This is the payoff for never storing a computed volume: the table and the
 * chart are a query, and a weight corrected in the routine editor reflows the
 * whole history rather than leaving a stale total behind.
 */

export type HistoryEntry = {
	sessionId: string;
	at: number;
	/** Heaviest load used for this movement that session. */
	weight: number;
	/** Most reps completed in a single set. */
	topSet: number;
	sets: number;
	reps: number;
	volume: number;
};

export type MovementHistory = {
	movementId: string;
	name: string;
	tool: Tool | null;
	entries: HistoryEntry[];
	/** Heaviest set ever logged, and when. */
	best: { weight: number; reps: number; at: number } | null;
	totalSessions: number;
};

export function movementHistory(
	db: Db,
	userId: string,
	movementId: string,
	limit = 8
): MovementHistory | null {
	const movement = db
		.select({ id: movements.id, name: movements.name, ownerUserId: movements.ownerUserId })
		.from(movements)
		.where(eq(movements.id, movementId))
		.get();

	// A private movement belongs to whoever created it; the shared catalog is
	// visible to everyone, but the *history* is always scoped to this account.
	if (!movement) return null;
	if (movement.ownerUserId !== null && movement.ownerUserId !== userId) return null;

	const recent = db
		.selectDistinct({ id: sessions.id, startedAt: sessions.startedAt })
		.from(sessions)
		.innerJoin(setLogs, eq(setLogs.sessionId, sessions.id))
		.where(and(eq(sessions.userId, userId), eq(setLogs.movementId, movementId)))
		.orderBy(desc(sessions.startedAt))
		.limit(limit)
		.all();

	const logs =
		recent.length === 0
			? []
			: db
					.select({
						sessionId: setLogs.sessionId,
						tool: setLogs.tool,
						weight: setLogs.weight,
						reps: setLogs.reps
					})
					.from(setLogs)
					.where(
						and(
							eq(setLogs.movementId, movementId),
							inArray(
								setLogs.sessionId,
								recent.map((s) => s.id)
							)
						)
					)
					.all();

	const bySession = new Map<string, HistoryEntry>();
	let tool: Tool | null = null;

	for (const session of recent) {
		bySession.set(session.id, {
			sessionId: session.id,
			at: session.startedAt.getTime(),
			weight: 0,
			topSet: 0,
			sets: 0,
			reps: 0,
			volume: 0
		});
	}

	for (const log of logs) {
		const entry = bySession.get(log.sessionId);
		if (!entry) continue;
		tool ??= log.tool;
		entry.weight = Math.max(entry.weight, log.weight);
		entry.topSet = Math.max(entry.topSet, log.reps);
		entry.sets += 1;
		entry.reps += log.reps;
		entry.volume += setVolume({ tool: log.tool, weight: log.weight }, log.reps);
	}

	// Oldest first, so the chart reads left to right.
	const entries = [...bySession.values()].sort((a, b) => a.at - b.at);

	const best = db
		.select({ weight: setLogs.weight, reps: setLogs.reps, at: setLogs.loggedAt })
		.from(setLogs)
		.innerJoin(sessions, eq(sessions.id, setLogs.sessionId))
		.where(and(eq(sessions.userId, userId), eq(setLogs.movementId, movementId)))
		.orderBy(desc(setLogs.weight), desc(setLogs.reps))
		.limit(1)
		.get();

	const totalSessions = db
		.selectDistinct({ id: sessions.id })
		.from(sessions)
		.innerJoin(setLogs, eq(setLogs.sessionId, sessions.id))
		.where(and(eq(sessions.userId, userId), eq(setLogs.movementId, movementId)))
		.all().length;

	return {
		movementId: movement.id,
		name: movement.name,
		tool,
		entries,
		best: best ? { weight: best.weight, reps: best.reps, at: best.at.getTime() } : null,
		totalSessions
	};
}
