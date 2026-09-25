import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { dayExercises, days, movements, sessions, setLogs, users } from './db/schema';
import { eq } from 'drizzle-orm';
import { parseSessionPayload } from '$lib/session-payload';
import { movementHistory } from './history';
import { lastLogPerMovement } from './routine';
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

describe('warm-up sets', () => {
	/** Deadlift-style: two warm-ups on the bench, then the working sets. */
	function logWithWarmups() {
		db.update(dayExercises)
			.set({
				warmups: [
					{ weight: 45, reps: 5 },
					{ weight: 95, reps: 3 }
				]
			})
			.where(eq(dayExercises.id, exerciseId))
			.run();
		const id = crypto.randomUUID();
		const base = {
			dayExerciseId: exerciseId,
			movementId: benchId,
			exerciseIndex: 0,
			slot: 0,
			tool: 'barbell' as const
		};
		saveSession(db, userId, {
			id,
			dayId,
			startedAt: START,
			endedAt: START + 45 * 60_000,
			logs: [
				{ ...base, setIndex: 0, warmup: true, weight: 45, reps: 5, loggedAt: START + 60_000 },
				{ ...base, setIndex: 0, weight: 115, reps: 8, loggedAt: START + 120_000 }
			]
		});
		return id;
	}

	it('are accepted in a payload beside a working set with the same number', () => {
		const log = {
			dayExerciseId: null,
			movementId: benchId,
			exerciseIndex: 0,
			setIndex: 0,
			slot: 0,
			tool: 'barbell',
			weight: 45,
			reps: 5,
			loggedAt: START
		};
		const body = { id: 'x', dayId, startedAt: START, endedAt: START + 1000 };
		expect(parseSessionPayload({ ...body, logs: [{ ...log, warmup: true }, log] }).ok).toBe(true);
		expect(parseSessionPayload({ ...body, logs: [log, log] }).ok).toBe(false);
		expect(parseSessionPayload({ ...body, logs: [{ ...log, warmup: 'yes' }] }).ok).toBe(false);
	});

	it('are stored, flagged, and counted in the workout’s volume', () => {
		const id = logWithWarmups();
		expect(
			db
				.select()
				.from(setLogs)
				.all()
				.filter((l) => l.warmup)
		).toHaveLength(1);
		const [row] = listWorkouts(db, userId).filter((w) => w.id === id);
		expect(row.setCount).toBe(2);
		expect(row.volume).toBe(45 * 5 + 115 * 8);
	});

	it('are left out of "last time" and a lift’s set count, but not its volume', () => {
		logWithWarmups();
		expect(lastLogPerMovement(db, userId, [benchId]).get(benchId)).toMatchObject({
			weight: 115,
			reps: 8
		});
		const [entry] = movementHistory(db, userId, benchId)!.entries;
		expect(entry).toMatchObject({ sets: 1, topSet: 8, weight: 115 });
		expect(entry.volume).toBe(45 * 5 + 115 * 8);
	});

	it('show in a past workout, with a prescribed one never logged ready to fill in', () => {
		const id = logWithWarmups();
		const [ex] = workoutDetail(db, userId, id)!.exercises;
		expect(ex.warmups).toEqual([
			{ weight: 45, reps: 5, target: 5 },
			{ weight: 95, reps: null, target: 3 }
		]);
		expect(ex.slots[0].reps[0]).toBe(8);
	});

	it('can be corrected in a past workout: one changed, one filled in', () => {
		const id = logWithWarmups();
		saveWorkoutEdits(db, userId, id, {
			exercises: [
				{
					exerciseIndex: 0,
					slots: [{ slot: 0, weight: 115, reps: [8, null, null] }],
					warmups: [4, 3]
				}
			]
		});
		const [ex] = workoutDetail(db, userId, id)!.exercises;
		expect(ex.warmups.map((w) => w.reps)).toEqual([4, 3]);
		expect(ex.warmups[1].weight).toBe(95);
		expect(ex.slots[0].reps[0]).toBe(8);
	});

	it('refuses more warm-ups than the workout has', () => {
		const id = logWithWarmups();
		expect(() =>
			saveWorkoutEdits(db, userId, id, {
				exercises: [{ exerciseIndex: 0, slots: [], warmups: [5, 5, 5] }]
			})
		).toThrow(/warm-up/);
	});
});
