import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { movements, sessions, setLogs, users } from './db/schema';
import { listDays } from './routine';
import {
	reorderDays,
	resolveMovementId,
	saveDay,
	setSplit,
	type ExerciseInput
} from './routine-edit';

/**
 * The routine write paths, which are the destructive ones: setSplit deletes
 * days, saveDay deletes exercise rows, and both sit upstream of every logged
 * set. The invariant worth guarding is that editing a routine never costs
 * history — a set logged in March survives a day being renamed, reordered,
 * re-exercised or deleted in June.
 */

let db: Db;
let userId: string;
let otherUserId: string;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });

	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	db.insert(users)
		.values([
			{ id: userId, email: 'a@example.com', createdAt: new Date() },
			{ id: otherUserId, email: 'b@example.com', createdAt: new Date() }
		])
		.run();
});

const exercise = (over: Partial<ExerciseInput> = {}): ExerciseInput => ({
	id: null,
	name: 'Bench press',
	tool: 'barbell',
	weight: 135,
	pairName: null,
	pairTool: null,
	pairWeight: null,
	sets: 3,
	reps: 8,
	note: '',
	...over
});

/** A session with one logged set against the given exercise row. */
function logASet(dayId: string, dayExerciseId: string, movementId: string): string {
	const sessionId = crypto.randomUUID();
	db.insert(sessions)
		.values({
			id: sessionId,
			userId,
			dayId,
			dayKey: 'A',
			dayTitle: 'A day',
			startedAt: new Date('2026-03-01T10:00:00Z'),
			endedAt: new Date('2026-03-01T11:00:00Z'),
			durationMins: 60
		})
		.run();
	db.insert(setLogs)
		.values({
			sessionId,
			dayExerciseId,
			movementId,
			exerciseIndex: 0,
			setIndex: 0,
			slot: 0,
			tool: 'barbell',
			weight: 135,
			reps: 8,
			loggedAt: new Date('2026-03-01T10:30:00Z')
		})
		.run();
	return sessionId;
}

describe('setSplit', () => {
	it('creates the rotation in letter order', () => {
		setSplit(db, userId, 3);
		expect(listDays(db, userId).map((d) => d.key)).toEqual(['A', 'B', 'C']);
	});

	it('refuses a split nobody trains', () => {
		for (const size of [0, 1, 6, 2.5, NaN]) {
			expect(() => setSplit(db, userId, size)).toThrow();
		}
	});

	it('leaves the days you already have alone when growing', () => {
		setSplit(db, userId, 2);
		const before = listDays(db, userId);
		saveDay(db, userId, before[0].id, 'Push', [exercise()]);

		setSplit(db, userId, 4);
		const after = listDays(db, userId);

		// Same rows, same ids, same contents — growing adds, it does not rebuild.
		expect(after.slice(0, 2).map((d) => d.id)).toEqual(before.map((d) => d.id));
		expect(after[0].title).toBe('Push');
		expect(after[0].exercises).toHaveLength(1);
	});

	it('drops from the end of the rotation when shrinking', () => {
		setSplit(db, userId, 4);
		setSplit(db, userId, 2);
		expect(listDays(db, userId).map((d) => d.key)).toEqual(['A', 'B']);
	});

	it('reuses a freed letter rather than running out', () => {
		setSplit(db, userId, 4); // A B C D
		setSplit(db, userId, 3); // D goes
		setSplit(db, userId, 4); // and comes back as D, not E
		expect(listDays(db, userId).map((d) => d.key)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('keeps history when a day is deleted', () => {
		setSplit(db, userId, 3);
		const day = listDays(db, userId)[2];
		saveDay(db, userId, day.id, 'Pull', [exercise({ name: 'Barbell row' })]);
		const row = listDays(db, userId)[2].exercises[0];
		const sessionId = logASet(day.id, row.id, row.main.movementId);

		setSplit(db, userId, 2);

		// The day is gone; the workout that happened in it is not. day_id goes
		// null, and day_key on the session is what "the last four B days" reads.
		const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
		expect(session).toBeDefined();
		expect(session?.dayId).toBeNull();
		expect(db.select().from(setLogs).all()).toHaveLength(1);
	});

	it('does not touch another account', () => {
		setSplit(db, userId, 3);
		setSplit(db, otherUserId, 2);
		expect(listDays(db, userId)).toHaveLength(3);
		expect(listDays(db, otherUserId)).toHaveLength(2);
	});
});

describe('reorderDays', () => {
	it('moves positions without re-lettering', () => {
		setSplit(db, userId, 3);
		const before = listDays(db, userId);
		const reversed = [...before].reverse().map((d) => d.id);

		reorderDays(db, userId, reversed);
		const after = listDays(db, userId);

		expect(after.map((d) => d.id)).toEqual(reversed);
		// The letter is the day's identity — sessions denormalize it, so moving a
		// day in the rotation must not hand its letter to a different day.
		expect(after.map((d) => d.key)).toEqual(['C', 'B', 'A']);
	});

	it('refuses a list that is not exactly the days you own', () => {
		setSplit(db, userId, 3);
		setSplit(db, otherUserId, 2);
		const mine = listDays(db, userId).map((d) => d.id);
		const theirs = listDays(db, otherUserId)[0].id;

		expect(() => reorderDays(db, userId, mine.slice(0, 2))).toThrow();
		expect(() => reorderDays(db, userId, [...mine, theirs])).toThrow();
		expect(() => reorderDays(db, userId, [mine[0], mine[1], theirs])).toThrow();
	});

	it('leaves the order untouched when it refuses', () => {
		setSplit(db, userId, 3);
		const before = listDays(db, userId).map((d) => d.id);
		expect(() => reorderDays(db, userId, [before[0]])).toThrow();
		expect(listDays(db, userId).map((d) => d.id)).toEqual(before);
	});
});

describe('resolveMovementId', () => {
	it('matches an existing name whatever its case', () => {
		const first = resolveMovementId(db, userId, 'Hack squat', 'barbell');
		const again = resolveMovementId(db, userId, 'HACK SQUAT', 'machine');
		expect(again).toBe(first);
	});

	it('prefers the shared catalog over a private duplicate', () => {
		const globalId = crypto.randomUUID();
		const privateId = crypto.randomUUID();
		db.insert(movements)
			.values([
				{ id: globalId, name: 'Deadlift', ownerUserId: null, defaultTool: 'barbell' },
				{ id: privateId, name: 'Deadlift', ownerUserId: userId, defaultTool: 'barbell' }
			])
			.run();

		expect(resolveMovementId(db, userId, 'deadlift', 'barbell')).toBe(globalId);
	});

	it('does not reach into another account’s movements', () => {
		const theirs = crypto.randomUUID();
		db.insert(movements)
			.values({
				id: theirs,
				name: 'Zercher squat',
				ownerUserId: otherUserId,
				defaultTool: 'barbell'
			})
			.run();

		expect(resolveMovementId(db, userId, 'Zercher squat', 'barbell')).not.toBe(theirs);
	});

	it('refuses a nameless movement', () => {
		expect(() => resolveMovementId(db, userId, '   ', 'barbell')).toThrow();
	});
});

describe('saveDay', () => {
	let dayId: string;

	beforeEach(() => {
		setSplit(db, userId, 2);
		dayId = listDays(db, userId)[0].id;
	});

	it('writes the title and the exercises', () => {
		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ name: 'Bench press' }),
			exercise({ name: 'Overhead press', weight: 95 })
		]);

		const day = listDays(db, userId)[0];
		expect(day.title).toBe('Upper push');
		expect(day.exercises.map((e) => e.main.name)).toEqual(['Bench press', 'Overhead press']);
		expect(day.exercises[1].main.weight).toBe(95);
	});

	it('keeps the old title rather than saving a blank one', () => {
		saveDay(db, userId, dayId, 'Upper push', [exercise()]);
		saveDay(db, userId, dayId, '   ', [exercise({ id: listDays(db, userId)[0].exercises[0].id })]);
		expect(listDays(db, userId)[0].title).toBe('Upper push');
	});

	it('keeps history attached to a row it edits', () => {
		saveDay(db, userId, dayId, 'Upper push', [exercise()]);
		const row = listDays(db, userId)[0].exercises[0];
		logASet(dayId, row.id, row.main.movementId);

		// The whole reason rows are matched by id instead of being deleted and
		// re-inserted: a weight change must not orphan every set ever logged
		// against that exercise.
		saveDay(db, userId, dayId, 'Upper push', [exercise({ id: row.id, weight: 145 })]);

		const log = db.select().from(setLogs).get();
		expect(log?.dayExerciseId).toBe(row.id);
		expect(listDays(db, userId)[0].exercises[0].main.weight).toBe(145);
	});

	it('keeps the logs of a row it removes, unlinked', () => {
		saveDay(db, userId, dayId, 'Upper push', [exercise()]);
		const row = listDays(db, userId)[0].exercises[0];
		logASet(dayId, row.id, row.main.movementId);

		saveDay(db, userId, dayId, 'Upper push', []);

		expect(listDays(db, userId)[0].exercises).toHaveLength(0);
		const log = db.select().from(setLogs).get();
		// Still there, still carrying its weight and reps — just no longer
		// pointing at a routine row that no longer exists.
		expect(log).toBeDefined();
		expect(log?.dayExerciseId).toBeNull();
		expect(log?.reps).toBe(8);
	});

	it('reorders by the order it is given', () => {
		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ name: 'Bench press' }),
			exercise({ name: 'Barbell row' })
		]);
		const rows = listDays(db, userId)[0].exercises;

		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ id: rows[1].id, name: 'Barbell row' }),
			exercise({ id: rows[0].id, name: 'Bench press' })
		]);

		expect(listDays(db, userId)[0].exercises.map((e) => e.main.name)).toEqual([
			'Barbell row',
			'Bench press'
		]);
	});

	it('stores a superset and clears it again', () => {
		saveDay(db, userId, dayId, 'Upper push', [
			exercise({
				name: 'Landmine row',
				pairName: 'Incline press',
				pairTool: 'dumbbell',
				pairWeight: 40
			})
		]);

		const paired = listDays(db, userId)[0].exercises[0];
		expect(paired.pair).toMatchObject({ name: 'Incline press', tool: 'dumbbell', weight: 40 });

		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ id: paired.id, name: 'Landmine row', pairName: '  ' })
		]);
		// Whitespace is not a movement; unpairing has to clear all three columns
		// or the row keeps rendering as a superset.
		expect(listDays(db, userId)[0].exercises[0].pair).toBeNull();
	});

	it('lets a movement be paired with itself without duplicating it', () => {
		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ name: 'Hack squat', pairName: 'hack squat', pairTool: 'machine', pairWeight: 90 })
		]);

		const row = listDays(db, userId)[0].exercises[0];
		// Same movement, so the same id on both halves. The workout screen keys
		// its movement list by position for exactly this reason.
		expect(row.pair?.movementId).toBe(row.main.movementId);
	});

	it('refuses a day belonging to someone else', () => {
		setSplit(db, otherUserId, 2);
		const theirs = listDays(db, otherUserId)[0].id;
		expect(() => saveDay(db, userId, theirs, 'Mine now', [exercise()])).toThrow();
		expect(listDays(db, otherUserId)[0].exercises).toHaveLength(0);
	});

	it('does not half-save when an exercise is invalid', () => {
		saveDay(db, userId, dayId, 'Upper push', [exercise({ name: 'Bench press' })]);
		const row = listDays(db, userId)[0].exercises[0];

		// A nameless movement throws from inside the transaction; nothing it did
		// before that point may survive.
		expect(() =>
			saveDay(db, userId, dayId, 'Renamed', [
				exercise({ id: row.id, name: 'Bench press', weight: 999 }),
				exercise({ name: '' })
			])
		).toThrow();

		const after = listDays(db, userId)[0];
		expect(after.title).toBe('Upper push');
		expect(after.exercises).toHaveLength(1);
		expect(after.exercises[0].main.weight).toBe(135);
	});
});

describe('the movement catalog during one save', () => {
	it('reuses a single new movement across rows that name it', () => {
		setSplit(db, userId, 2);
		const dayId = listDays(db, userId)[0].id;

		saveDay(db, userId, dayId, 'Upper push', [
			exercise({ name: 'Cable fly' }),
			exercise({ name: 'cable fly' })
		]);

		const rows = listDays(db, userId)[0].exercises;
		// The catalog is read once per save and written back to as names are
		// created, so the second row must find the first row's movement rather
		// than minting a second one that splits the history in two.
		expect(rows[1].main.movementId).toBe(rows[0].main.movementId);
		expect(db.select().from(movements).all()).toHaveLength(1);
	});
});

describe('warm-up sets in the routine', () => {
	it('are saved with the exercise and read back, lightest first', () => {
		setSplit(db, userId, 2);
		const [day] = listDays(db, userId);
		const warmups = [
			{ weight: 135, reps: 5 },
			{ weight: 185, reps: 3 },
			{ weight: 205, reps: 1 }
		];
		saveDay(db, userId, day.id, 'Lower', [exercise({ name: 'Deadlift', weight: 225, warmups })]);
		const saved = listDays(db, userId).find((d) => d.id === day.id)!;
		expect(saved.exercises[0].warmups).toEqual(warmups);
	});

	it('default to none', () => {
		setSplit(db, userId, 2);
		const [day] = listDays(db, userId);
		saveDay(db, userId, day.id, 'Lower', [exercise()]);
		expect(listDays(db, userId).find((d) => d.id === day.id)!.exercises[0].warmups).toEqual([]);
	});
});
