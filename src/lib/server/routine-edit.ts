import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Warmup } from '$lib/warmups';
import { DAY_KEYS, MAX_SPLIT, MIN_SPLIT, type DayKey, type Tool } from '$lib/types';
import type { Db, Queryable } from './db/client';
import { dayExercises, days, movements } from './db/schema';

/**
 * Write paths for the routine.
 *
 * A note on day letters: they are assigned once and never reassigned. Sessions
 * denormalize `day_key` so that "the last four B days" still resolves years
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
 * Name → movement id, for one save.
 *
 * The catalog is read once and kept in a map: saving a day resolves a name per
 * exercise, and each of those was re-reading every movement this account can
 * see. Names it creates go into the map too, so two rows naming the same new
 * movement share one, exactly as two calls against the database would have.
 *
 * Matching is case-insensitive, so "Hack Squat" does not become a second "Hack
 * squat", and the shared catalog wins over a private duplicate of the same name.
 */
function movementResolver(db: Queryable, userId: string) {
	const candidates = db
		.select({ id: movements.id, name: movements.name, ownerUserId: movements.ownerUserId })
		.from(movements)
		.where(or(isNull(movements.ownerUserId), eq(movements.ownerUserId, userId)))
		.all();

	const byName = new Map<string, string>();
	// Private first, then global over the top: the last write wins, so the
	// shared catalog's id is the one that survives for a name owned by both.
	for (const m of candidates.filter((m) => m.ownerUserId !== null)) {
		byName.set(m.name.toLowerCase(), m.id);
	}
	for (const m of candidates.filter((m) => m.ownerUserId === null)) {
		byName.set(m.name.toLowerCase(), m.id);
	}

	return (name: string, defaultTool: Tool): string => {
		const trimmed = name.trim();
		if (!trimmed) throw new Error('A movement needs a name');

		const lowered = trimmed.toLowerCase();
		const known = byName.get(lowered);
		if (known) return known;

		const id = crypto.randomUUID();
		db.insert(movements).values({ id, name: trimmed, ownerUserId: userId, defaultTool }).run();
		byName.set(lowered, id);
		return id;
	};
}

/**
 * Finds a movement by name, creating a private one for this account if the name
 * is new. A single lookup; `saveDay` builds one resolver for the whole save.
 */
export function resolveMovementId(
	db: Queryable,
	userId: string,
	name: string,
	defaultTool: Tool
): string {
	return movementResolver(db, userId)(name, defaultTool);
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
	/** Warm-up sets for the main movement; empty for none. */
	warmups?: Warmup[];
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

		const resolve = movementResolver(tx, userId);

		exercises.forEach((ex, position) => {
			const movementId = resolve(ex.name, ex.tool);
			const pairName = ex.pairName?.trim() ?? '';
			const hasPair = pairName !== '';
			const pairMovementId = hasPair ? resolve(pairName, ex.pairTool ?? ex.tool) : null;

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
				note: ex.note ?? '',
				warmups: ex.warmups ?? []
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
