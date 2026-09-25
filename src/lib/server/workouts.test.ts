import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { dayExercises, days, movements, sessions, setLogs, users } from './db/schema';
import { saveSession } from './sessions';
import {
	listWorkouts,
	saveWorkoutEdits,
	workoutDetail,
	WorkoutEditError,
	type WorkoutEdits
} from './workouts';

let db: Db;
let userId: string;
let otherUserId: string;
let dayId: string;
let exerciseId: string;
let benchId: string;
let pressId: string;

const START = 1_700_000_000_000;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	dayId = crypto.randomUUID();
	exerciseId = crypto.randomUUID();
	benchId = crypto.randomUUID();
	pressId = crypto.randomUUID();

	db.insert(users)
		.values([
			{ id: userId, email: 'greg@example.com' },
			{ id: otherUserId, email: 'friend@example.com' }
		])
		.run();
	db.insert(movements)
		.values([
			{ id: benchId, name: 'Close grip bench', defaultTool: 'barbell' },
			{ id: pressId, name: 'Incline press', defaultTool: 'dumbbell' }
		])
		.run();
	db.insert(days).values({ id: dayId, userId, key: 'B', position: 0, title: 'Upper' }).run();
	// A superset, prescribed at 3 sets of 8.
	db.insert(dayExercises)
		.values({
			id: exerciseId,
			dayId,
			position: 0,
			movementId: benchId,
			tool: 'barbell',
			weight: 115,
			pairMovementId: pressId,
			pairTool: 'dumbbell',
			pairWeight: 40,
			sets: 3,
			reps: 8
		})
		.run();
});

/** Logs a workout: sets 1–2 of the bench, set 1 of the press. */
function logWorkout(id = crypto.randomUUID(), startedAt = START) {
	const log = (setIndex: number, slot: number, reps: number) => ({
		dayExerciseId: exerciseId,
		movementId: slot === 0 ? benchId : pressId,
		exerciseIndex: 0,
		setIndex,
		slot,
		tool: slot === 0 ? ('barbell' as const) : ('dumbbell' as const),
		weight: slot === 0 ? 115 : 40,
		reps,
		loggedAt: startedAt + 60_000
	});
	saveSession(db, userId, {
		id,
		dayId,
		startedAt,
		endedAt: startedAt + 45 * 60_000,
		logs: [log(0, 0, 8), log(1, 0, 7), log(0, 1, 8)]
	});
	return id;
}

describe('listWorkouts', () => {
	it('lists newest first, with each workout’s sets and volume', () => {
		const older = logWorkout(undefined, START);
		const newer = logWorkout(undefined, START + 86_400_000);
		const list = listWorkouts(db, userId);
		expect(list.map((w) => w.id)).toEqual([newer, older]);
		expect(list[0]).toMatchObject({ dayKey: 'B', dayTitle: 'Upper', setCount: 3 });
		expect(list[0].volume).toBeGreaterThan(0);
	});

	it('shows nobody else’s workouts', () => {
		logWorkout();
		expect(listWorkouts(db, otherUserId)).toEqual([]);
	});
});

describe('workoutDetail', () => {
	it('rebuilds the exercise with every prescribed set, logged or not', () => {
		const id = logWorkout();
		const detail = workoutDetail(db, userId, id)!;
		expect(detail.exercises).toHaveLength(1);
		const [ex] = detail.exercises;
		expect(ex).toMatchObject({ sets: 3, target: 8 });
		expect(ex.slots.map((s) => s.name)).toEqual(['Close grip bench', 'Incline press']);
		expect(ex.slots[0].reps).toEqual([8, 7, null]);
		expect(ex.slots[1].reps).toEqual([8, null, null]);
	});

	it('will not open another account’s workout', () => {
		const id = logWorkout();
		expect(workoutDetail(db, otherUserId, id)).toBeNull();
	});
});

describe('saveWorkoutEdits', () => {
	const edits = (
		bench: (number | null)[],
		press: (number | null)[],
		weight = 115
	): WorkoutEdits => ({
		exercises: [
			{
				exerciseIndex: 0,
				slots: [
					{ slot: 0, weight, reps: bench },
					{ slot: 1, weight: 40, reps: press }
				]
			}
		]
	});

	it('corrects reps, fills in a set never tapped, and clears one', () => {
		const id = logWorkout();
		saveWorkoutEdits(db, userId, id, edits([8, 8, 6], [null, 8, null]));
		const [ex] = workoutDetail(db, userId, id)!.exercises;
		expect(ex.slots[0].reps).toEqual([8, 8, 6]);
		expect(ex.slots[1].reps).toEqual([null, 8, null]);
	});

	it('changes a movement’s weight on every one of its sets', () => {
		const id = logWorkout();
		saveWorkoutEdits(db, userId, id, edits([8, 7, null], [8, null, null], 125));
		const bench = db
			.select()
			.from(setLogs)
			.all()
			.filter((l) => l.movementId === benchId);
		expect(bench.map((l) => l.weight)).toEqual([125, 125]);
	});

	it('refuses to leave a workout with no sets, and writes nothing', () => {
		const id = logWorkout();
		expect(() =>
			saveWorkoutEdits(db, userId, id, edits([null, null, null], [null, null, null]))
		).toThrow(/at least one set/);
		expect(db.select().from(setLogs).all()).toHaveLength(3);
	});

	it('refuses another account’s workout, and edits outside the workout’s shape', () => {
		const id = logWorkout();
		expect(() => saveWorkoutEdits(db, otherUserId, id, edits([8], [8]))).toThrow(WorkoutEditError);
		expect(() =>
			saveWorkoutEdits(db, userId, id, { exercises: [{ exerciseIndex: 5, slots: [] }] })
		).toThrow(/Unknown exercise/);
		expect(() => saveWorkoutEdits(db, userId, id, edits([8, 8, 8, 8], [8]))).toThrow(
			/Too many sets/
		);
		expect(() => saveWorkoutEdits(db, userId, id, edits([-1], [8]))).toThrow(/Invalid reps/);
		expect(() => saveWorkoutEdits(db, userId, id, edits([8], [8], Number.NaN))).toThrow(
			/Invalid weight/
		);
	});

	it('keeps the workout itself as it was', () => {
		const id = logWorkout();
		saveWorkoutEdits(db, userId, id, edits([8, 8, 8], [8, 8, 8]));
		expect(db.select().from(sessions).get()).toMatchObject({ id, durationMins: 45 });
	});
});
