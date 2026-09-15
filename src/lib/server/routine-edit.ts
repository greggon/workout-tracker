import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { DAY_KEYS, MAX_SPLIT, MIN_SPLIT, type DayKey, type Tool } from '$lib/types';
import type { Db, Queryable } from './db/client';
import { dayExercises, days, movements } from './db/schema';

/**
 * Write paths for the routine.
 *
 * A note on day letters: they are assigned once and never reassigned. Sessions
 * denormalise `day_key` so that "the last four B days" still resolves years
 * after the routine changed — if reordering re-lettered days, every past
 * session would silently start pointing at a different day. Reordering
 * therefore moves `position` only, and the letter is the day's identity.
 */

/** Lowest letter not currently in use, so deleting D then adding one reuses D. */
function nextFreeKey(used: Set<string>): DayKey {
	const free = DAY_KEYS.find((k) => !used.has(k));
	if (!free) throw new Error('All day letters are in use');
	return free;
}

/**
 * Finds a movement by name, preferring the shared catalog, and creates a
 * private one for this account if the name is new. Matching is
 * case-insensitive so "Hack Squat" does not become a second "Hack squat".
 */
export function resolveMovementId(
	db: Queryable,
	userId: string,
	name: string,
	defaultTool: Tool
): string {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('A movement needs a name');

	const candidates = db
		.select({ id: movements.id, name: movements.name, ownerUserId: movements.ownerUserId })
		.from(movements)
		.where(or(isNull(movements.ownerUserId), eq(movements.ownerUserId, userId)))
		.all();

	const lowered = trimmed.toLowerCase();
	// Shared catalog wins over a private duplicate.
	const match =
		candidates.find((m) => m.ownerUserId === null && m.name.toLowerCase() === lowered) ??
		candidates.find((m) => m.name.toLowerCase() === lowered);
	if (match) return match.id;

	const id = crypto.randomUUID();
	db.insert(movements).values({ id, name: trimmed, ownerUserId: userId, defaultTool }).run();
	return id;
}

/** Grows or shrinks the rotation, keeping existing days untouched. */
export function setSplit(db: Db, userId: string, size: number): void {
	if (!Number.isInteger(size) || size < MIN_SPLIT || size > MAX_SPLIT) {
		throw new Error(`Split must be between ${MIN_SPLIT} and ${MAX_SPLIT} days`);
	}

	db.transaction((tx) => {
		const existing = tx
			.select()
			.from(days)
			.where(eq(days.userId, userId))
			.orderBy(days.position)
			.all();

		// Shrinking drops from the end of the rotation. Cascades remove the
		// day's exercises; sessions keep their history with day_id nulled.
		if (size < existing.length) {
			const doomed = existing.slice(size).map((d) => d.id);
			tx.delete(days).where(inArray(days.id, doomed)).run();
		}

		const used = new Set(existing.slice(0, size).map((d) => d.key));
		for (let i = existing.length; i < size; i++) {
			const key = nextFreeKey(used);
			used.add(key);
			tx.insert(days)
				.values({ userId, key, position: i, title: `${key} day` })
				.run();
		}
	});
}

/** Rewrites rotation order. Positions are not unique, so no shuffle dance. */
export function reorderDays(db: Db, userId: string, orderedIds: string[]): void {
	db.transaction((tx) => {
		const owned = new Set(
			tx
				.select({ id: days.id })
				.from(days)
				.where(eq(days.userId, userId))
				.all()
				.map((d) => d.id)
		);
		if (orderedIds.length !== owned.size || orderedIds.some((id) => !owned.has(id))) {
			throw new Error('Reorder must list exactly the days you own');
		}
		orderedIds.forEach((id, position) => {
			tx.update(days).set({ position }).where(eq(days.id, id)).run();
		});
	});
}

export type ExerciseInput = {
	/** Null for a row that did not exist before. */
	id: string | null;
	name: string;
	tool: Tool;
	weight: number;
	pairName: string | null;
	pairTool: Tool | null;
	pairWeight: number | null;
	sets: number;
	reps: number;
	note: string;
};

/**
 * Replaces a day's title and exercise list.
 *
 * Rows are matched by id rather than deleted and re-inserted wholesale: every
 * `set_logs` row points at the `day_exercises` row it came from, and recreating
 * unchanged rows would null those links on every save.
 */
export function saveDay(
	db: Db,
	userId: string,
	dayId: string,
	title: string,
	exercises: ExerciseInput[]
): void {
	db.transaction((tx) => {
		const day = tx
			.select()
			.from(days)
			.where(and(eq(days.id, dayId), eq(days.userId, userId)))
			.get();
		if (!day) throw new Error('No such day');

		const existing = tx
			.select({ id: dayExercises.id })
			.from(dayExercises)
			.where(eq(dayExercises.dayId, dayId))
			.all()
			.map((r) => r.id);

		const kept = new Set(exercises.map((e) => e.id).filter((id): id is string => id !== null));
		const removed = existing.filter((id) => !kept.has(id));
		if (removed.length) {
			tx.delete(dayExercises).where(inArray(dayExercises.id, removed)).run();
		}

		exercises.forEach((ex, position) => {
			const movementId = resolveMovementId(tx, userId, ex.name, ex.tool);
			const hasPair = Boolean(ex.pairName && ex.pairName.trim());
			const pairMovementId = hasPair
				? resolveMovementId(tx, userId, ex.pairName!, ex.pairTool ?? ex.tool)
				: null;

			const values = {
				dayId,
				position,
				movementId,
				tool: ex.tool,
				weight: ex.weight,
				pairMovementId,
				pairTool: hasPair ? (ex.pairTool ?? ex.tool) : null,
				pairWeight: hasPair ? (ex.pairWeight ?? ex.weight) : null,
				sets: ex.sets,
				reps: ex.reps,
				note: ex.note ?? ''
			};

			if (ex.id && existing.includes(ex.id)) {
				tx.update(dayExercises).set(values).where(eq(dayExercises.id, ex.id)).run();
			} else {
				tx.insert(dayExercises).values(values).run();
			}
		});

		tx.update(days)
			.set({ title: title.trim() || day.title })
			.where(eq(days.id, dayId))
			.run();
	});
}
