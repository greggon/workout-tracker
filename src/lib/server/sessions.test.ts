import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseSessionPayload, type SessionInput } from '$lib/session-payload';
import { createDb, type Db } from './db/client';
import { dayExercises, days, movements, sessions, setLogs, users } from './db/schema';
import { SessionError, saveSession, summarizeSession } from './sessions';

let db: Db;
let userId: string;
let otherUserId: string;
let dayId: string;
let exerciseId: string;
let barbellId: string;
let dumbbellId: string;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });

	userId = crypto.randomUUID();
	otherUserId = crypto.randomUUID();
	dayId = crypto.randomUUID();
	exerciseId = crypto.randomUUID();
	barbellId = crypto.randomUUID();
	dumbbellId = crypto.randomUUID();

	db.insert(users)
		.values([
			{ id: userId, email: 'greg@example.com' },
			{ id: otherUserId, email: 'friend@example.com' }
		])
		.run();
	db.insert(movements)
		.values([
			{ id: barbellId, name: 'Close grip bench', defaultTool: 'barbell' },
			{ id: dumbbellId, name: 'Incline press', defaultTool: 'dumbbell' }
		])
		.run();
	db.insert(days).values({ id: dayId, userId, key: 'B', position: 0, title: 'Upper' }).run();
	db.insert(dayExercises)
		.values({
			id: exerciseId,
			dayId,
			position: 0,
			movementId: barbellId,
			tool: 'barbell',
			weight: 115,
			sets: 2,
			reps: 8
		})
		.run();
});

const START = 1_700_000_000_000;

function payload(overrides: Partial<SessionInput> = {}): SessionInput {
	return {
		id: crypto.randomUUID(),
		dayId,
		startedAt: START,
		endedAt: START + 52 * 60_000,
		logs: [
			{
				dayExerciseId: exerciseId,
				movementId: barbellId,
				exerciseIndex: 0,
				setIndex: 0,
				slot: 0,
				tool: 'barbell',
				weight: 115,
				reps: 8,
				loggedAt: START + 60_000
			},
			{
				dayExerciseId: exerciseId,
				movementId: dumbbellId,
				exerciseIndex: 0,
				setIndex: 0,
				slot: 1,
				tool: 'dumbbell',
				weight: 40,
				reps: 10,
				loggedAt: START + 90_000
			}
		],
		...overrides
	};
}

describe('saveSession', () => {
	it('stores the session and its logs', () => {
		const input = payload();
		expect(saveSession(db, userId, input)).toEqual({ created: true });
		expect(db.select().from(sessions).all()).toHaveLength(1);
		expect(db.select().from(setLogs).all()).toHaveLength(2);
	});

	it('denormalizes the day letter so history survives routine edits', () => {
		const input = payload();
		saveSession(db, userId, input);
		db.delete(days).where(eq(days.id, dayId)).run();

		const stored = db.select().from(sessions).get()!;
		expect(stored.dayKey).toBe('B');
		expect(stored.dayTitle).toBe('Upper');
		expect(stored.dayId).toBeNull();
	});

	it('is idempotent: a replay changes nothing', () => {
		const input = payload();
		expect(saveSession(db, userId, input).created).toBe(true);
		expect(saveSession(db, userId, input).created).toBe(false);
		expect(saveSession(db, userId, input).created).toBe(false);

		expect(db.select().from(sessions).all()).toHaveLength(1);
		expect(db.select().from(setLogs).all()).toHaveLength(2);
	});

	it('will not let one account claim another account’s session id', () => {
		const input = payload();
		saveSession(db, userId, input);
		expect(() => saveSession(db, otherUserId, input)).toThrow(SessionError);
	});

	it('refuses a day the account does not own', () => {
		expect(() => saveSession(db, otherUserId, payload())).toThrow(/No such day/);
	});

	it('refuses a movement that does not exist', () => {
		const input = payload();
		input.logs[0].movementId = 'not-a-movement';
		expect(() => saveSession(db, userId, input)).toThrow(/Unknown movement/);
	});

	it('drops an exercise reference that belongs to another day', () => {
		// A forged or stale id must not attach this log to someone else's row.
		const input = payload();
		input.logs[0].dayExerciseId = crypto.randomUUID();
		saveSession(db, userId, input);

		const stored = db.select().from(setLogs).all();
		expect(stored.find((l) => l.movementId === barbellId)?.dayExerciseId).toBeNull();
		expect(stored.find((l) => l.movementId === dumbbellId)?.dayExerciseId).toBe(exerciseId);
	});

	it('writes nothing at all when a log is bad', () => {
		const input = payload();
		input.logs[1].movementId = 'nope';
		expect(() => saveSession(db, userId, input)).toThrow();
		expect(db.select().from(sessions).all()).toHaveLength(0);
		expect(db.select().from(setLogs).all()).toHaveLength(0);
	});

	it('never records a zero-minute session', () => {
		saveSession(db, userId, payload({ endedAt: START + 1000 }));
		expect(db.select().from(sessions).get()!.durationMins).toBe(1);
	});

	it('leaves time spent paused out of the duration, but keeps the real timestamps', () => {
		saveSession(db, userId, payload({ pausedMs: 30 * 60_000 }));
		const stored = db.select().from(sessions).get()!;
		expect(stored.durationMins).toBe(22);
		expect(stored.endedAt.getTime()).toBe(START + 52 * 60_000);
	});
});

describe('summarizeSession', () => {
	it('counts dumbbell volume twice and barbell once', () => {
		const input = payload();
		saveSession(db, userId, input);
		const summary = summarizeSession(db, userId, input.id);

		// 115 × 8 = 920, and 40 × 2 × 10 = 800.
		expect(summary.volume).toBe(1720);
		expect(summary.setCount).toBe(2);
		expect(summary.rows.map((r) => [r.name, r.volume])).toEqual([
			['Close grip bench', 920],
			['Incline press', 800]
		]);
	});

	it('has no delta on the first session of a day', () => {
		const input = payload();
		saveSession(db, userId, input);
		const summary = summarizeSession(db, userId, input.id);
		expect(summary.previousVolume).toBeNull();
		expect(summary.history).toHaveLength(1);
		expect(summary.history[0].current).toBe(true);
	});

	it('charts earlier same-day sessions oldest first, with today last', () => {
		const first = payload({ startedAt: START, endedAt: START + 60_000 });
		saveSession(db, userId, first);

		const week = 7 * 86_400_000;
		const second = payload({ startedAt: START + week, endedAt: START + week + 60_000 });
		second.logs = second.logs.map((l) => ({ ...l, reps: l.reps + 2, loggedAt: l.loggedAt + week }));
		saveSession(db, userId, second);

		const summary = summarizeSession(db, userId, second.id);
		expect(summary.history).toHaveLength(2);
		expect(summary.history[0].current).toBe(false);
		expect(summary.history[1].current).toBe(true);
		expect(summary.history[0].startedAt).toBeLessThan(summary.history[1].startedAt);
		expect(summary.previousVolume).toBe(summary.history[0].volume);
		// More reps at the same weight is more volume.
		expect(summary.volume).toBeGreaterThan(summary.previousVolume!);
	});

	// The summary screen offers "Update routine", which needs the day to link to.
	it('carries the routine day id, and null once that day is gone', () => {
		const input = payload();
		saveSession(db, userId, input);
		expect(summarizeSession(db, userId, input.id).dayId).toBe(dayId);

		db.delete(days).where(eq(days.id, dayId)).run();
		expect(summarizeSession(db, userId, input.id).dayId).toBeNull();
	});

	it('refuses to summarize another account’s session', () => {
		const input = payload();
		saveSession(db, userId, input);
		expect(() => summarizeSession(db, otherUserId, input.id)).toThrow(/No such session/);
	});
});

describe('parseSessionPayload', () => {
	const body = () => JSON.parse(JSON.stringify(payload())) as Record<string, unknown>;

	it('accepts a well-formed payload', () => {
		expect(parseSessionPayload(body()).ok).toBe(true);
	});

	it('accepts a paused time, and a payload queued before there was one', () => {
		const paused = parseSessionPayload({ ...body(), pausedMs: 60_000 });
		expect(paused.ok && paused.value.pausedMs).toBe(60_000);
		const older = parseSessionPayload(body());
		expect(older.ok && older.value.pausedMs).toBeUndefined();
	});

	it('rejects a paused time that is negative or longer than the session', () => {
		expect(parseSessionPayload({ ...body(), pausedMs: -1 })).toMatchObject({ ok: false });
		expect(parseSessionPayload({ ...body(), pausedMs: 53 * 60_000 })).toMatchObject({
			ok: false,
			error: /paused/
		});
		expect(parseSessionPayload({ ...body(), pausedMs: 'a while' })).toMatchObject({ ok: false });
	});

	it('rejects the shapes that are not a session', () => {
		expect(parseSessionPayload(null)).toMatchObject({ ok: false });
		expect(parseSessionPayload('nope')).toMatchObject({ ok: false });
		expect(parseSessionPayload({})).toMatchObject({ ok: false, error: /session id/ });
	});

	it('rejects a session with no sets, which is a bug rather than a workout', () => {
		expect(parseSessionPayload({ ...body(), logs: [] })).toMatchObject({
			ok: false,
			error: /at least one set/
		});
	});

	it('rejects time running backwards', () => {
		const raw = body();
		expect(parseSessionPayload({ ...raw, endedAt: (raw.startedAt as number) - 1 })).toMatchObject({
			ok: false,
			error: /ended before/
		});
	});

	it('rejects an unknown tool', () => {
		const raw = body();
		(raw.logs as Record<string, unknown>[])[0].tool = 'trebuchet';
		expect(parseSessionPayload(raw)).toMatchObject({ ok: false, error: /unknown tool/ });
	});

	it('rejects implausible reps and weights', () => {
		const tooMany = body();
		(tooMany.logs as Record<string, unknown>[])[0].reps = 100_000;
		expect(parseSessionPayload(tooMany)).toMatchObject({ ok: false, error: /invalid reps/ });

		const tooHeavy = body();
		(tooHeavy.logs as Record<string, unknown>[])[0].weight = -5;
		expect(parseSessionPayload(tooHeavy)).toMatchObject({ ok: false, error: /invalid weight/ });
	});

	it('rejects a repeated slot', () => {
		const raw = body();
		const logs = raw.logs as Record<string, unknown>[];
		logs[1].slot = logs[0].slot;
		expect(parseSessionPayload(raw)).toMatchObject({ ok: false, error: /repeats slot/ });
	});

	it('caps the number of logs', () => {
		const raw = body();
		const one = (raw.logs as unknown[])[0];
		raw.logs = Array.from({ length: 601 }, (_, i) => ({
			...(one as object),
			setIndex: i % 100,
			exerciseIndex: Math.floor(i / 100)
		}));
		expect(parseSessionPayload(raw)).toMatchObject({ ok: false, error: /More than 600/ });
	});
});
