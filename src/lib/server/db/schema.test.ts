import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client';
import { dayExercises, days, movements, sessions, setLogs, users } from './schema';

/**
 * These lock in the referential rules the sync protocol depends on: a replayed
 * or deleted session must not strand set_logs, and editing a routine must never
 * destroy history. All of it rides on `PRAGMA foreign_keys = ON`, which SQLite
 * disables by default — so the first test is really a test of createDb().
 */

let db: Db;

/** A minimal but complete graph: user → day → exercise → session → set log. */
function fixture(email = 'a@example.com') {
	const userId = crypto.randomUUID();
	const movementId = crypto.randomUUID();
	const dayId = crypto.randomUUID();
	const exerciseId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();

	db.insert(users).values({ id: userId, email }).run();
	db.insert(movements)
		.values({ id: movementId, name: `Close grip bench ${email}`, defaultTool: 'barbell' })
		.run();
	db.insert(days).values({ id: dayId, userId, key: 'A', position: 0, title: 'Upper' }).run();
	db.insert(dayExercises)
		.values({
			id: exerciseId,
			dayId,
			position: 0,
			movementId,
			tool: 'barbell',
			weight: 117.5,
			sets: 2,
			reps: 8
		})
		.run();
	db.insert(sessions)
		.values({
			id: sessionId,
			userId,
			dayId,
			dayKey: 'A',
			startedAt: new Date(1_700_000_000_000),
			endedAt: new Date(1_700_003_120_000),
			durationMins: 52
		})
		.run();
	db.insert(setLogs)
		.values({
			sessionId,
			dayExerciseId: exerciseId,
			movementId,
			exerciseIndex: 0,
			setIndex: 0,
			slot: 0,
			tool: 'barbell',
			weight: 117.5,
			reps: 8,
			loggedAt: new Date(1_700_000_600_000)
		})
		.run();

	return { userId, movementId, dayId, exerciseId, sessionId };
}

const countSetLogs = () =>
	db
		.select({ n: sql<number>`count(*)` })
		.from(setLogs)
		.get()!.n;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
});

describe('foreign keys', () => {
	it('rejects a set log with no parent session', () => {
		const { movementId } = fixture();
		expect(() =>
			db
				.insert(setLogs)
				.values({
					sessionId: 'no-such-session',
					movementId,
					exerciseIndex: 0,
					setIndex: 0,
					slot: 0,
					tool: 'barbell',
					weight: 100,
					reps: 5,
					loggedAt: new Date()
				})
				.run()
		).toThrow(/FOREIGN KEY/);
	});

	it('cascades set logs when a session is deleted', () => {
		const { sessionId } = fixture();
		expect(countSetLogs()).toBe(1);
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		expect(countSetLogs()).toBe(0);
	});

	it('cascades everything a user owns when the account is deleted', () => {
		const { userId } = fixture();
		db.delete(users).where(eq(users.id, userId)).run();
		expect(countSetLogs()).toBe(0);
		expect(db.select().from(sessions).all()).toHaveLength(0);
		expect(db.select().from(dayExercises).all()).toHaveLength(0);
	});

	it('refuses to delete a movement that history still references', () => {
		const { movementId } = fixture();
		expect(() => db.delete(movements).where(eq(movements.id, movementId)).run()).toThrow(
			/FOREIGN KEY/
		);
	});
});

describe('routine edits preserve history', () => {
	it('nulls day_exercise_id rather than deleting the log', () => {
		const { exerciseId } = fixture();
		db.delete(dayExercises).where(eq(dayExercises.id, exerciseId)).run();

		const logs = db.select().from(setLogs).all();
		expect(logs).toHaveLength(1);
		expect(logs[0].dayExerciseId).toBeNull();
		// The movement reference survives, so the history chart still resolves.
		expect(logs[0].movementId).not.toBeNull();
	});

	it('keeps sessions queryable by day_key after the day is deleted', () => {
		const { dayId } = fixture();
		db.delete(days).where(eq(days.id, dayId)).run();

		const rows = db.select().from(sessions).where(eq(sessions.dayKey, 'A')).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].dayId).toBeNull();
	});
});

describe('movement catalog uniqueness', () => {
	it('allows only one shared movement per name', () => {
		db.insert(movements).values({ name: 'Hack squat', defaultTool: 'machine' }).run();
		expect(() =>
			db.insert(movements).values({ name: 'Hack squat', defaultTool: 'machine' }).run()
		).toThrow(/UNIQUE/);
	});

	it('lets two accounts each keep a private movement of the same name', () => {
		const a = crypto.randomUUID();
		const b = crypto.randomUUID();
		db.insert(users)
			.values([
				{ id: a, email: 'a@x.com' },
				{ id: b, email: 'b@x.com' }
			])
			.run();

		db.insert(movements)
			.values({ name: 'Zercher carry', ownerUserId: a, defaultTool: 'barbell' })
			.run();
		db.insert(movements)
			.values({ name: 'Zercher carry', ownerUserId: b, defaultTool: 'barbell' })
			.run();

		expect(db.select().from(movements).all()).toHaveLength(2);
	});

	it('still rejects a duplicate within one account', () => {
		const a = crypto.randomUUID();
		db.insert(users).values({ id: a, email: 'a@x.com' }).run();
		db.insert(movements)
			.values({ name: 'Zercher carry', ownerUserId: a, defaultTool: 'barbell' })
			.run();
		expect(() =>
			db
				.insert(movements)
				.values({ name: 'Zercher carry', ownerUserId: a, defaultTool: 'barbell' })
				.run()
		).toThrow(/UNIQUE/);
	});
});

describe('set log identity', () => {
	it('rejects a duplicate slot within one session', () => {
		const { sessionId, movementId, exerciseId } = fixture();
		expect(() =>
			db
				.insert(setLogs)
				.values({
					sessionId,
					dayExerciseId: exerciseId,
					movementId,
					exerciseIndex: 0,
					setIndex: 0,
					slot: 0,
					tool: 'barbell',
					weight: 120,
					reps: 8,
					loggedAt: new Date()
				})
				.run()
		).toThrow(/UNIQUE/);
	});

	it('keeps both halves of a superset', () => {
		const { sessionId, movementId, exerciseId } = fixture();
		db.insert(setLogs)
			.values({
				sessionId,
				dayExerciseId: exerciseId,
				movementId,
				exerciseIndex: 0,
				setIndex: 0,
				slot: 1,
				tool: 'pulley',
				weight: 117.5,
				reps: 8,
				loggedAt: new Date()
			})
			.run();
		expect(countSetLogs()).toBe(2);
	});
});

describe('defaults', () => {
	it('gives a new account the standard plate set', () => {
		const { userId } = fixture();
		const user = db.select().from(users).where(eq(users.id, userId)).get()!;
		expect(user.barWeight).toBe(45);
		expect(user.plateInventory).toEqual([45, 35, 25, 10, 5, 2.5]);
	});
});
