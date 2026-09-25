import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DayKey, Tool } from '$lib/types';
import { setVolume } from '$lib/volume';
import type { Db } from './db/client';
import { dayExercises, movements, sessions, setLogs } from './db/schema';

/**
 * Past workouts, as workouts: listed newest first, opened one at a time, and
 * corrected after the fact — a rep miscounted, a set that was done but never
 * tapped, the wrong weight on the bar.
 *
 * Volume is never stored (see set_logs), so a correction here reflows every
 * chart and total on its own.
 */

export type WorkoutListItem = {
	id: string;
	startedAt: number;
	dayKey: DayKey;
	dayTitle: string;
	durationMins: number;
	setCount: number;
	volume: number;
};

/** Every workout this account has logged, newest first. */
export function listWorkouts(db: Db, userId: string): WorkoutListItem[] {
	const rows = db
		.select({
			id: sessions.id,
			startedAt: sessions.startedAt,
			dayKey: sessions.dayKey,
			dayTitle: sessions.dayTitle,
			durationMins: sessions.durationMins
		})
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.orderBy(desc(sessions.startedAt))
		.all();
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

	const totals = new Map<string, { sets: number; volume: number }>();
	for (const log of logs) {
		const t = totals.get(log.sessionId) ?? { sets: 0, volume: 0 };
		t.sets += 1;
		t.volume += setVolume(log, log.reps);
		totals.set(log.sessionId, t);
	}

	return rows.map((r) => ({
		...r,
		startedAt: r.startedAt.getTime(),
		setCount: totals.get(r.id)?.sets ?? 0,
		volume: totals.get(r.id)?.volume ?? 0
	}));
}

/** One movement of an exercise — the main lift, or its superset pair. */
export type WorkoutSlot = {
	slot: number;
	movementId: string;
	name: string;
	tool: Tool;
	weight: number;
	/** Reps per set, null where the set was not logged. */
	reps: (number | null)[];
};

export type WorkoutExercise = {
	exerciseIndex: number;
	dayExerciseId: string | null;
	/** The prescribed reps, when the routine still has this exercise. */
	target: number | null;
	sets: number;
	slots: WorkoutSlot[];
};

export type WorkoutDetail = {
	id: string;
	startedAt: number;
	durationMins: number;
	dayKey: DayKey;
	dayTitle: string;
	exercises: WorkoutExercise[];
};

/**
 * A workout, rebuilt from its logged sets.
 *
 * Only exercises with at least one logged set can be rebuilt — a skipped one
 * left nothing behind to say what it was. Each shows as many sets as were
 * logged, or as the routine still prescribes if that is more, so a set that
 * was done but never tapped can be filled in.
 */
export function workoutDetail(db: Db, userId: string, sessionId: string): WorkoutDetail | null {
	const session = db
		.select()
		.from(sessions)
		.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
		.get();
	if (!session) return null;

	const logs = db
		.select({
			exerciseIndex: setLogs.exerciseIndex,
			setIndex: setLogs.setIndex,
			slot: setLogs.slot,
			movementId: setLogs.movementId,
			name: movements.name,
			tool: setLogs.tool,
			weight: setLogs.weight,
			reps: setLogs.reps,
			dayExerciseId: setLogs.dayExerciseId
		})
		.from(setLogs)
		.innerJoin(movements, eq(movements.id, setLogs.movementId))
		.where(eq(setLogs.sessionId, sessionId))
		.all();

	const planIds = [...new Set(logs.map((l) => l.dayExerciseId).filter((id) => id !== null))];
	const plans = new Map(
		(planIds.length
			? db
					.select({ id: dayExercises.id, sets: dayExercises.sets, reps: dayExercises.reps })
					.from(dayExercises)
					.where(inArray(dayExercises.id, planIds))
					.all()
			: []
		).map((p) => [p.id, p])
	);

	const byExercise = new Map<number, typeof logs>();
	for (const log of logs) {
		const list = byExercise.get(log.exerciseIndex) ?? [];
		list.push(log);
		byExercise.set(log.exerciseIndex, list);
	}

	const exercises: WorkoutExercise[] = [...byExercise.entries()]
		.sort(([a], [b]) => a - b)
		.map(([exerciseIndex, list]) => {
			const dayExerciseId = list.find((l) => l.dayExerciseId)?.dayExerciseId ?? null;
			const plan = dayExerciseId ? plans.get(dayExerciseId) : undefined;
			const sets = Math.max(plan?.sets ?? 0, ...list.map((l) => l.setIndex + 1));

			const slotNumbers = [...new Set(list.map((l) => l.slot))].sort((a, b) => a - b);
			const slots = slotNumbers.map((slot) => {
				const own = list.filter((l) => l.slot === slot);
				const first = own[0];
				const reps: (number | null)[] = Array.from({ length: sets }, () => null);
				for (const l of own) reps[l.setIndex] = l.reps;
				return {
					slot,
					movementId: first.movementId,
					name: first.name,
					tool: first.tool,
					// One weight per movement per workout — the heaviest, if they differ.
					weight: Math.max(...own.map((l) => l.weight)),
					reps
				};
			});

			return {
				exerciseIndex,
				dayExerciseId,
				target: plan?.reps ?? Math.max(...list.map((l) => l.reps)),
				sets,
				slots
			};
		});

	return {
		id: session.id,
		startedAt: session.startedAt.getTime(),
		durationMins: session.durationMins,
		dayKey: session.dayKey,
		dayTitle: session.dayTitle,
		exercises
	};
}

/** What the editor sends back: every set's reps, and each movement's weight. */
export type WorkoutEdits = {
	exercises: {
		exerciseIndex: number;
		slots: { slot: number; weight: number; reps: (number | null)[] }[];
	}[];
};

export class WorkoutEditError extends Error {}

const MAX_REPS = 1000;
const MAX_WEIGHT = 10_000;

/**
 * Validates untrusted edits against the workout they claim to edit. Only the
 * exercises, movements and sets the workout already has can be written; the
 * shape of a past workout is not something the editor changes.
 */
export function parseWorkoutEdits(raw: unknown, detail: WorkoutDetail): WorkoutEdits {
	const fail = (message: string): never => {
		throw new WorkoutEditError(message);
	};
	if (!raw || typeof raw !== 'object' || !Array.isArray((raw as WorkoutEdits).exercises)) {
		fail('Expected a list of exercises');
	}
	const edits = raw as WorkoutEdits;

	for (const ex of edits.exercises) {
		const known = detail.exercises.find((e) => e.exerciseIndex === ex?.exerciseIndex);
		if (!known || !Array.isArray(ex.slots)) fail('Unknown exercise');
		for (const s of ex.slots) {
			if (!known!.slots.some((k) => k.slot === s?.slot)) fail('Unknown movement');
			if (typeof s.weight !== 'number' || !Number.isFinite(s.weight)) fail('Invalid weight');
			if (s.weight < 0 || s.weight > MAX_WEIGHT) fail('Invalid weight');
			if (!Array.isArray(s.reps) || s.reps.length > known!.sets) fail('Too many sets');
			for (const r of s.reps) {
				if (r === null) continue;
				if (!Number.isInteger(r) || r < 0 || r > MAX_REPS) fail('Invalid reps');
			}
		}
	}
	return edits;
}

/**
 * Writes the edits. A set given reps is written — updated if it was logged,
 * added if it was not; a set given null is removed. A movement's weight
 * applies to every one of its sets in this workout.
 */
export function saveWorkoutEdits(db: Db, userId: string, sessionId: string, raw: unknown): void {
	const detail = workoutDetail(db, userId, sessionId);
	if (!detail) throw new WorkoutEditError('No such workout');
	const edits = parseWorkoutEdits(raw, detail);

	const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()!;

	db.transaction((tx) => {
		const existing = tx.select().from(setLogs).where(eq(setLogs.sessionId, sessionId)).all();
		const find = (e: number, set: number, slot: number) =>
			existing.find((l) => l.exerciseIndex === e && l.setIndex === set && l.slot === slot);

		for (const ex of edits.exercises) {
			const known = detail.exercises.find((e) => e.exerciseIndex === ex.exerciseIndex)!;
			for (const s of ex.slots) {
				const movement = known.slots.find((k) => k.slot === s.slot)!;
				s.reps.forEach((reps, setIndex) => {
					const row = find(ex.exerciseIndex, setIndex, s.slot);
					if (reps === null) {
						if (row) tx.delete(setLogs).where(eq(setLogs.id, row.id)).run();
					} else if (row) {
						tx.update(setLogs).set({ reps, weight: s.weight }).where(eq(setLogs.id, row.id)).run();
					} else {
						tx.insert(setLogs)
							.values({
								sessionId,
								dayExerciseId: known.dayExerciseId,
								movementId: movement.movementId,
								exerciseIndex: ex.exerciseIndex,
								setIndex,
								slot: s.slot,
								tool: movement.tool,
								weight: s.weight,
								reps,
								// Filled in afterwards, so it has no moment of its own.
								loggedAt: session.endedAt
							})
							.run();
					}
				});
			}
		}

		const left = tx
			.select({ id: setLogs.id })
			.from(setLogs)
			.where(eq(setLogs.sessionId, sessionId))
			.all();
		// Rolls the whole edit back: a workout with no sets is not a workout.
		if (left.length === 0) throw new WorkoutEditError('A workout needs at least one set');
	});
}
