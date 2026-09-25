import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { DayKey, Tool } from '$lib/types';
import type { Warmup } from '$lib/warmups';
import { setVolume } from '$lib/volume';
import type { Db } from './db/client';
import { dayExercises, days, movements, sessions, setLogs } from './db/schema';

/**
 * Read paths for the routine and the home screen.
 *
 * Volume is summed in JavaScript from raw `set_logs` rather than with a SQL
 * `CASE` expression. A SQL sum would have to restate the dumbbell-counts-double
 * rule, giving the codebase two copies that can silently disagree; this way
 * `toolMultiplier` stays the only place that rule exists. The row counts
 * involved are tiny — a session is a few dozen logs.
 */

export type RoutineMovement = {
	movementId: string;
	name: string;
	tool: Tool;
	weight: number;
};

export type RoutineExercise = {
	id: string;
	position: number;
	sets: number;
	reps: number;
	note: string;
	main: RoutineMovement;
	/** Present when this exercise is a superset. */
	pair: RoutineMovement | null;
	/** Warm-up sets for the main movement, lightest first; usually none. */
	warmups: Warmup[];
};

export type RoutineDay = {
	id: string;
	key: DayKey;
	position: number;
	title: string;
	exercises: RoutineExercise[];
};

export function listDays(db: Db, userId: string): RoutineDay[] {
	const dayRows = db
		.select()
		.from(days)
		.where(eq(days.userId, userId))
		.orderBy(days.position)
		.all();

	if (dayRows.length === 0) return [];

	const pairMovements = alias(movements, 'pair_movements');
	const exerciseRows = db
		.select({
			id: dayExercises.id,
			dayId: dayExercises.dayId,
			position: dayExercises.position,
			sets: dayExercises.sets,
			reps: dayExercises.reps,
			note: dayExercises.note,
			movementId: dayExercises.movementId,
			movementName: movements.name,
			tool: dayExercises.tool,
			weight: dayExercises.weight,
			pairMovementId: dayExercises.pairMovementId,
			pairName: pairMovements.name,
			pairTool: dayExercises.pairTool,
			pairWeight: dayExercises.pairWeight,
			warmups: dayExercises.warmups
		})
		.from(dayExercises)
		.innerJoin(movements, eq(movements.id, dayExercises.movementId))
		.leftJoin(pairMovements, eq(pairMovements.id, dayExercises.pairMovementId))
		.where(
			inArray(
				dayExercises.dayId,
				dayRows.map((d) => d.id)
			)
		)
		.orderBy(dayExercises.position)
		.all();

	const byDay = new Map<string, RoutineExercise[]>(dayRows.map((d) => [d.id, []]));
	for (const row of exerciseRows) {
		byDay.get(row.dayId)?.push({
			id: row.id,
			position: row.position,
			sets: row.sets,
			reps: row.reps,
			note: row.note,
			main: {
				movementId: row.movementId,
				name: row.movementName,
				tool: row.tool,
				weight: row.weight
			},
			pair:
				row.pairMovementId && row.pairName && row.pairTool && row.pairWeight !== null
					? {
							movementId: row.pairMovementId,
							name: row.pairName,
							tool: row.pairTool,
							weight: row.pairWeight
						}
					: null,
			warmups: row.warmups ?? []
		});
	}

	return dayRows.map((d) => ({
		id: d.id,
		key: d.key,
		position: d.position,
		title: d.title,
		exercises: byDay.get(d.id) ?? []
	}));
}

export type SessionSummary = {
	id: string;
	dayKey: DayKey;
	startedAt: Date;
	durationMins: number;
	volume: number;
};

/** Most recent sessions first, with volume computed from their logs. */
export function recentSessions(db: Db, userId: string, limit: number): SessionSummary[] {
	const rows = db
		.select({
			id: sessions.id,
			dayKey: sessions.dayKey,
			startedAt: sessions.startedAt,
			durationMins: sessions.durationMins
		})
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.orderBy(desc(sessions.startedAt))
		.limit(limit)
		.all();

	return withVolume(db, rows);
}

/**
 * The latest session for each day letter. Queried per key rather than taken
 * from a recent-sessions window: a day skipped for months would fall outside
 * any fixed window and wrongly read as never trained.
 */
export function lastSessionPerDay(
	db: Db,
	userId: string,
	keys: DayKey[]
): Map<string, SessionSummary> {
	const rows = keys
		.map((key) =>
			db
				.select({
					id: sessions.id,
					dayKey: sessions.dayKey,
					startedAt: sessions.startedAt,
					durationMins: sessions.durationMins
				})
				.from(sessions)
				.where(and(eq(sessions.userId, userId), eq(sessions.dayKey, key)))
				.orderBy(desc(sessions.startedAt))
				.limit(1)
				.get()
		)
		.filter((r) => r !== undefined);

	return new Map(withVolume(db, rows).map((s) => [s.dayKey, s]));
}

export function countSessions(db: Db, userId: string): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(sessions)
			.where(eq(sessions.userId, userId))
			.get()?.n ?? 0
	);
}

function withVolume(
	db: Db,
	rows: { id: string; dayKey: DayKey; startedAt: Date; durationMins: number }[]
): SessionSummary[] {
	if (rows.length === 0) return [];

	const logs = db
		.select({
			sessionId: setLogs.sessionId,
			tool: setLogs.tool,
			weight: setLogs.weight,
			reps: setLogs.reps
		})
		.from(setLogs)
		.where(
			inArray(
				setLogs.sessionId,
				rows.map((r) => r.id)
			)
		)
		.all();

	const volumes = new Map<string, number>();
	for (const log of logs) {
		volumes.set(
			log.sessionId,
			(volumes.get(log.sessionId) ?? 0) +
				setVolume({ tool: log.tool, weight: log.weight }, log.reps)
		);
	}

	return rows.map((r) => ({ ...r, volume: volumes.get(r.id) ?? 0 }));
}

export type LastLog = { weight: number; reps: number; loggedAt: Date };

/**
 * The most recent logged set for each movement, across this account's history.
 *
 * Drives the "Last time · 115 lb × 8" hint on the workout screen. Queried per
 * movement so the `set_logs(movement_id, logged_at)` index does the work and a
 * movement untouched for a year is still found.
 */
export function lastLogPerMovement(
	db: Db,
	userId: string,
	movementIds: string[]
): Map<string, LastLog> {
	const found = new Map<string, LastLog>();

	for (const movementId of new Set(movementIds)) {
		const row = db
			.select({
				weight: setLogs.weight,
				reps: setLogs.reps,
				loggedAt: setLogs.loggedAt
			})
			.from(setLogs)
			.innerJoin(sessions, eq(sessions.id, setLogs.sessionId))
			// A working set: "last time" means the weight you trained at, not
			// the warm-up on the way to it.
			.where(
				and(
					eq(sessions.userId, userId),
					eq(setLogs.movementId, movementId),
					eq(setLogs.warmup, false)
				)
			)
			.orderBy(desc(setLogs.loggedAt))
			.limit(1)
			.get();

		if (row) found.set(movementId, row);
	}

	return found;
}
