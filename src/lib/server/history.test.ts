import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { movements, sessions, setLogs, users } from './db/schema';
import { movementHistory } from './history';

let db: Db;
let userId: string;
let otherUserId: string;
let benchId: string;
let privateId: string;

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });

	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	benchId = crypto.randomUUID();
	privateId = crypto.randomUUID();

	db.insert(users)
		.values([
			{ id: userId, email: 'greg@example.com' },
			{ id: otherUserId, email: 'friend@example.com' }
		])
		.run();
	db.insert(movements)
		.values([
			{ id: benchId, name: 'Close grip bench', defaultTool: 'barbell' },
			{ id: privateId, name: 'Zercher carry', ownerUserId: otherUserId, defaultTool: 'barbell' }
		])
		.run();
});

/** One session for `who`, `daysAgo` back, logging the given sets. */
function logSession(
	who: string,
	weeksBack: number,
	sets: { weight: number; reps: number; tool?: 'barbell' | 'dumbbell' }[],
	movementId = benchId
) {
	const id = crypto.randomUUID();
	const startedAt = new Date(T0 - weeksBack * 7 * DAY);
	db.insert(sessions)
		.values({
			id,
			userId: who,
			dayKey: 'B',
			startedAt,
			endedAt: new Date(startedAt.getTime() + 3_000_000),
			durationMins: 50
		})
		.run();
	db.insert(setLogs)
		.values(
			sets.map((s, i) => ({
				sessionId: id,
				movementId,
				exerciseIndex: 0,
				setIndex: i,
				slot: 0,
				tool: s.tool ?? ('barbell' as const),
				weight: s.weight,
				reps: s.reps,
				loggedAt: startedAt
			}))
		)
		.run();
	return id;
}

describe('movementHistory', () => {
	it('aggregates each session into one row', () => {
		logSession(userId, 0, [
			{ weight: 115, reps: 8 },
			{ weight: 115, reps: 7 }
		]);

		const history = movementHistory(db, userId, benchId)!;
		expect(history.entries).toHaveLength(1);
		expect(history.entries[0]).toMatchObject({
			weight: 115,
			topSet: 8,
			sets: 2,
			reps: 15,
			volume: 115 * 15
		});
	});

	it('reports the heaviest load and the best single set of the session', () => {
		// A ramp: the row should show the top weight and the best reps at it.
		logSession(userId, 0, [
			{ weight: 95, reps: 10 },
			{ weight: 135, reps: 5 }
		]);

		const history = movementHistory(db, userId, benchId)!;
		expect(history.entries[0].weight).toBe(135);
		expect(history.entries[0].topSet).toBe(10);
	});

	it('counts dumbbell volume twice', () => {
		logSession(userId, 0, [{ weight: 40, reps: 10, tool: 'dumbbell' }]);
		expect(movementHistory(db, userId, benchId)!.entries[0].volume).toBe(800);
	});

	it('orders oldest first, so the chart reads left to right', () => {
		logSession(userId, 2, [{ weight: 105, reps: 8 }]);
		logSession(userId, 1, [{ weight: 110, reps: 8 }]);
		logSession(userId, 0, [{ weight: 115, reps: 8 }]);

		const history = movementHistory(db, userId, benchId)!;
		expect(history.entries.map((e) => e.weight)).toEqual([105, 110, 115]);
	});

	it('keeps the most recent sessions when there are more than the limit', () => {
		for (let w = 9; w >= 0; w--) logSession(userId, w, [{ weight: 100 + w, reps: 5 }]);

		const history = movementHistory(db, userId, benchId, 4)!;
		expect(history.entries).toHaveLength(4);
		// Weights descend with age, so the newest four are the lowest numbers.
		expect(history.entries.map((e) => e.weight)).toEqual([103, 102, 101, 100]);
		expect(history.totalSessions).toBe(10);
	});

	it('reports the heaviest set ever, beyond the charted window', () => {
		logSession(userId, 20, [{ weight: 200, reps: 3 }]);
		for (let w = 5; w >= 0; w--) logSession(userId, w, [{ weight: 120, reps: 8 }]);

		const history = movementHistory(db, userId, benchId, 4)!;
		expect(history.entries).toHaveLength(4);
		expect(history.best).toMatchObject({ weight: 200, reps: 3 });
	});

	it('never shows another account’s sets', () => {
		logSession(otherUserId, 0, [{ weight: 315, reps: 5 }]);
		logSession(userId, 0, [{ weight: 115, reps: 8 }]);

		const history = movementHistory(db, userId, benchId)!;
		expect(history.entries).toHaveLength(1);
		expect(history.entries[0].weight).toBe(115);
		expect(history.best!.weight).toBe(115);
	});

	it('refuses a movement private to another account', () => {
		expect(movementHistory(db, userId, privateId)).toBeNull();
	});

	it('returns an empty history rather than null for an untouched movement', () => {
		const history = movementHistory(db, userId, benchId)!;
		expect(history.entries).toEqual([]);
		expect(history.best).toBeNull();
		expect(history.totalSessions).toBe(0);
	});

	it('is null for a movement that does not exist', () => {
		expect(movementHistory(db, userId, crypto.randomUUID())).toBeNull();
	});
});
