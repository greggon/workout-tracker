import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { sessions, setLogs, users } from './db/schema';
import {
	countSessions,
	lastLogPerMovement,
	lastSessionPerDay,
	listDays,
	recentSessions
} from './routine';
import { resolveMovementId, saveDay, setSplit } from './routine-edit';
import type { Tool } from '$lib/types';

/**
 * The read path behind the home screen and the workout screen.
 *
 * Volume is the thing to watch: it is summed in JavaScript from raw set_logs so
 * that the dumbbell-counts-double rule has exactly one home, which means these
 * numbers are only right if this code agrees with `setVolume`. The other is
 * reach — "when did I last do this" has to find a session from any distance
 * back, not just within a recent window.
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

const at = (iso: string) => new Date(iso);

/** A finished session with the given logs, as the API would have stored it. */
function session(
	owner: string,
	opts: {
		dayKey: 'A' | 'B' | 'C';
		startedAt: string;
		durationMins?: number;
		logs?: { movementId: string; tool: Tool; weight: number; reps: number; loggedAt: string }[];
	}
): string {
	const id = crypto.randomUUID();
	db.insert(sessions)
		.values({
			id,
			userId: owner,
			dayId: null,
			dayKey: opts.dayKey,
			dayTitle: `${opts.dayKey} day`,
			startedAt: at(opts.startedAt),
			endedAt: at(opts.startedAt),
			durationMins: opts.durationMins ?? 60
		})
		.run();

	(opts.logs ?? []).forEach((log, i) => {
		db.insert(setLogs)
			.values({
				sessionId: id,
				dayExerciseId: null,
				movementId: log.movementId,
				exerciseIndex: 0,
				setIndex: i,
				slot: 0,
				tool: log.tool,
				weight: log.weight,
				reps: log.reps,
				loggedAt: at(log.loggedAt)
			})
			.run();
	});

	return id;
}

describe('listDays', () => {
	it('has nothing to say about an account with no routine', () => {
		expect(listDays(db, userId)).toEqual([]);
	});

	it('returns days in rotation order with their exercises in position order', () => {
		setSplit(db, userId, 2);
		const [first] = listDays(db, userId);
		saveDay(db, userId, first.id, 'Upper', [
			{
				id: null,
				name: 'Bench press',
				tool: 'barbell',
				weight: 135,
				pairName: null,
				pairTool: null,
				pairWeight: null,
				sets: 3,
				reps: 8,
				note: 'Slow eccentric'
			},
			{
				id: null,
				name: 'Landmine row',
				tool: 'landmine',
				weight: 41,
				pairName: 'Incline press',
				pairTool: 'dumbbell',
				pairWeight: 40,
				sets: 2,
				reps: 10,
				note: ''
			}
		]);

		const day = listDays(db, userId)[0];
		expect(day.exercises.map((e) => e.main.name)).toEqual(['Bench press', 'Landmine row']);
		expect(day.exercises[0].note).toBe('Slow eccentric');
		// The pair is hydrated from a second join on the same table; a half-built
		// pair (id but no name) has to come back as null rather than as a partial.
		expect(day.exercises[0].pair).toBeNull();
		expect(day.exercises[1].pair).toMatchObject({
			name: 'Incline press',
			tool: 'dumbbell',
			weight: 40
		});
	});

	it('never returns another account’s days', () => {
		setSplit(db, userId, 2);
		setSplit(db, otherUserId, 3);
		expect(listDays(db, userId)).toHaveLength(2);
		expect(listDays(db, otherUserId)).toHaveLength(3);
	});
});

describe('recentSessions', () => {
	it('lists the newest first, up to the limit', () => {
		session(userId, { dayKey: 'A', startedAt: '2026-01-01T10:00:00Z' });
		session(userId, { dayKey: 'B', startedAt: '2026-03-01T10:00:00Z' });
		session(userId, { dayKey: 'C', startedAt: '2026-02-01T10:00:00Z' });

		expect(recentSessions(db, userId, 2).map((s) => s.dayKey)).toEqual(['B', 'C']);
	});

	it('counts a pair of dumbbells twice and a barbell once', () => {
		const bench = resolveMovementId(db, userId, 'Bench press', 'barbell');
		const curl = resolveMovementId(db, userId, 'Dumbbell curl', 'dumbbell');
		session(userId, {
			dayKey: 'A',
			startedAt: '2026-03-01T10:00:00Z',
			logs: [
				{
					movementId: bench,
					tool: 'barbell',
					weight: 100,
					reps: 5,
					loggedAt: '2026-03-01T10:05:00Z'
				},
				{
					movementId: curl,
					tool: 'dumbbell',
					weight: 30,
					reps: 10,
					loggedAt: '2026-03-01T10:10:00Z'
				}
			]
		});

		// 100×5 moved once, 30×10 moved in each hand.
		expect(recentSessions(db, userId, 5)[0].volume).toBe(500 + 600);
	});

	it('reports zero for a session with no logs rather than dropping it', () => {
		session(userId, { dayKey: 'A', startedAt: '2026-03-01T10:00:00Z' });
		expect(recentSessions(db, userId, 5)).toHaveLength(1);
		expect(recentSessions(db, userId, 5)[0].volume).toBe(0);
	});

	it('stays inside one account', () => {
		session(otherUserId, { dayKey: 'A', startedAt: '2026-03-01T10:00:00Z' });
		expect(recentSessions(db, userId, 5)).toEqual([]);
	});
});

describe('lastSessionPerDay', () => {
	it('finds the most recent of each letter', () => {
		session(userId, { dayKey: 'A', startedAt: '2026-01-01T10:00:00Z' });
		session(userId, { dayKey: 'A', startedAt: '2026-03-01T10:00:00Z' });
		session(userId, { dayKey: 'B', startedAt: '2026-02-01T10:00:00Z' });

		const found = lastSessionPerDay(db, userId, ['A', 'B']);
		expect(found.get('A')?.startedAt).toEqual(at('2026-03-01T10:00:00Z'));
		expect(found.get('B')?.startedAt).toEqual(at('2026-02-01T10:00:00Z'));
	});

	it('finds a day trained long ago, past any recent window', () => {
		session(userId, { dayKey: 'C', startedAt: '2020-01-01T10:00:00Z' });
		for (let i = 0; i < 30; i++) {
			session(userId, { dayKey: 'A', startedAt: `2026-0${(i % 9) + 1}-01T10:00:00Z` });
		}

		// Queried per letter rather than taken from a window of recent sessions,
		// so a day skipped for years still reads as trained rather than as new.
		expect(lastSessionPerDay(db, userId, ['A', 'C']).get('C')?.startedAt).toEqual(
			at('2020-01-01T10:00:00Z')
		);
	});

	it('omits a letter never trained', () => {
		session(userId, { dayKey: 'A', startedAt: '2026-03-01T10:00:00Z' });
		expect(lastSessionPerDay(db, userId, ['A', 'B']).has('B')).toBe(false);
	});
});

describe('countSessions', () => {
	it('counts this account only', () => {
		session(userId, { dayKey: 'A', startedAt: '2026-01-01T10:00:00Z' });
		session(userId, { dayKey: 'B', startedAt: '2026-02-01T10:00:00Z' });
		session(otherUserId, { dayKey: 'A', startedAt: '2026-02-01T10:00:00Z' });

		expect(countSessions(db, userId)).toBe(2);
		expect(countSessions(db, otherUserId)).toBe(1);
	});

	it('is zero before anything is logged', () => {
		expect(countSessions(db, userId)).toBe(0);
	});
});

describe('lastLogPerMovement', () => {
	it('returns the latest set for each movement asked about', () => {
		const bench = resolveMovementId(db, userId, 'Bench press', 'barbell');
		const squat = resolveMovementId(db, userId, 'Back squat', 'barbell');

		session(userId, {
			dayKey: 'A',
			startedAt: '2026-01-01T10:00:00Z',
			logs: [
				{
					movementId: bench,
					tool: 'barbell',
					weight: 115,
					reps: 8,
					loggedAt: '2026-01-01T10:05:00Z'
				}
			]
		});
		session(userId, {
			dayKey: 'A',
			startedAt: '2026-03-01T10:00:00Z',
			logs: [
				{
					movementId: bench,
					tool: 'barbell',
					weight: 135,
					reps: 5,
					loggedAt: '2026-03-01T10:05:00Z'
				},
				{
					movementId: squat,
					tool: 'barbell',
					weight: 225,
					reps: 3,
					loggedAt: '2026-03-01T10:20:00Z'
				}
			]
		});

		const found = lastLogPerMovement(db, userId, [bench, squat, bench]);
		expect(found.get(bench)).toMatchObject({ weight: 135, reps: 5 });
		expect(found.get(squat)).toMatchObject({ weight: 225, reps: 3 });
	});

	it('leaves out a movement with no history', () => {
		const fresh = resolveMovementId(db, userId, 'Pendlay row', 'barbell');
		expect(lastLogPerMovement(db, userId, [fresh]).has(fresh)).toBe(false);
	});

	it('does not read a set logged by another account', () => {
		const shared = resolveMovementId(db, userId, 'Bench press', 'barbell');
		session(otherUserId, {
			dayKey: 'A',
			startedAt: '2026-03-01T10:00:00Z',
			logs: [
				{
					movementId: shared,
					tool: 'barbell',
					weight: 315,
					reps: 1,
					loggedAt: '2026-03-01T10:05:00Z'
				}
			]
		});

		expect(lastLogPerMovement(db, userId, [shared]).has(shared)).toBe(false);
	});
});
