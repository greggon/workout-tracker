import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionInput } from '$lib/session-payload';
import { SyncQueue, type QueuedSession, type Submit } from './queue.svelte';
import {
	loadLive,
	loadPaused,
	saveLive,
	clearLive,
	PAUSED_STALE_AFTER_MS,
	STALE_AFTER_MS
} from './live';
import { memoryStore, type OfflineStore } from './store';
import { backoffMs, classifyResponse } from './sync';

describe('classifyResponse', () => {
	it('accepts a JSON success', () => {
		expect(classifyResponse(201, 'application/json')).toBe('saved');
		expect(classifyResponse(200, 'application/json; charset=utf-8')).toBe('saved');
	});

	it('treats HTML under a 200 as a signed-out session', () => {
		// This is the Access trap: the login page arrives with fetch having
		// silently followed a redirect, so the status says nothing useful.
		expect(classifyResponse(200, 'text/html')).toBe('reauth');
		expect(classifyResponse(200, null)).toBe('reauth');
	});

	it('treats explicit auth failures the same way', () => {
		expect(classifyResponse(401, 'application/json')).toBe('reauth');
		expect(classifyResponse(403, 'application/json')).toBe('reauth');
	});

	it('retries what might succeed later', () => {
		expect(classifyResponse(500, 'application/json')).toBe('retry');
		expect(classifyResponse(502, 'application/json')).toBe('retry');
		expect(classifyResponse(429, 'application/json')).toBe('retry');
		expect(classifyResponse(408, 'application/json')).toBe('retry');
	});

	it('stops retrying a verdict about the payload', () => {
		expect(classifyResponse(400, 'application/json')).toBe('rejected');
		expect(classifyResponse(409, 'application/json')).toBe('rejected');
		expect(classifyResponse(404, 'application/json')).toBe('rejected');
	});
});

describe('backoffMs', () => {
	it('grows and then stops growing', () => {
		expect(backoffMs(1)).toBe(5_000);
		expect(backoffMs(2)).toBe(10_000);
		expect(backoffMs(3)).toBe(20_000);
		expect(backoffMs(50)).toBe(300_000);
	});
});

const payload = (id: string): SessionInput => ({
	id,
	dayId: 'day-b',
	startedAt: 1_700_000_000_000,
	endedAt: 1_700_000_600_000,
	logs: [
		{
			dayExerciseId: 'ex-1',
			movementId: 'mv-1',
			exerciseIndex: 0,
			setIndex: 0,
			slot: 0,
			tool: 'barbell',
			weight: 115,
			reps: 8,
			loggedAt: 1_700_000_100_000
		}
	]
});

/** Records every submission so the tests can assert on retry behavior. */
function recorder(outcomes: Parameters<Submit>[0] extends never ? never : string[]) {
	const seen: string[] = [];
	let i = 0;
	const submit: Submit = async (p) => {
		seen.push(p.id);
		const outcome = (outcomes[Math.min(i, outcomes.length - 1)] ?? 'saved') as never;
		i++;
		return { outcome, error: outcome === 'rejected' ? 'Unknown movement' : undefined };
	};
	return { submit, seen };
}

let store: OfflineStore;

beforeEach(() => {
	store = memoryStore();
});

describe('SyncQueue', () => {
	it('sends and clears a workout that lands', async () => {
		const { submit, seen } = recorder(['saved']);
		const queue = new SyncQueue(store, submit);

		await queue.add(payload('a'));

		expect(seen).toEqual(['a']);
		expect(queue.pending).toBe(0);
		expect(queue.status).toBe('idle');
	});

	it('keeps a workout the network could not deliver', async () => {
		const queue = new SyncQueue(store, async () => {
			throw new Error('offline');
		});
		await queue.add(payload('a'));
		queue.clearRetry();

		expect(queue.pending).toBe(1);
		expect(queue.status).toBe('offline');
		expect((await queue.list())[0].payload.id).toBe('a');
	});

	it('delivers on a later drain, which is what coming back online does', async () => {
		let online = false;
		const queue = new SyncQueue(store, async () => {
			if (!online) throw new Error('offline');
			return { outcome: 'saved' };
		});

		await queue.add(payload('a'));
		expect(queue.pending).toBe(1);

		online = true;
		await queue.drain();
		expect(queue.pending).toBe(0);
		expect(queue.status).toBe('idle');
	});

	it('stops at the first signed-out answer rather than replaying the rest', async () => {
		const { submit, seen } = recorder(['reauth']);
		const queue = new SyncQueue(store, submit);

		await queue.add(payload('a'));
		await queue.add(payload('b'));
		await queue.drain();

		// Signing in fixes every item, so hammering the rest proves nothing.
		expect(queue.status).toBe('reauth');
		expect(queue.pending).toBe(2);
		expect(new Set(seen).size).toBe(1);
	});

	it('keeps a rejected workout instead of discarding it', async () => {
		const { submit } = recorder(['rejected']);
		const queue = new SyncQueue(store, submit);

		await queue.add(payload('a'));

		// Refused by the server, but still the only copy of a workout somebody
		// actually did. Losing it to tidy the queue is unrecoverable.
		expect(queue.pending).toBe(1);
		expect(queue.status).toBe('rejected');
		expect(queue.lastError).toBe('Unknown movement');
		expect((await queue.list())[0].error).toBe('Unknown movement');
	});

	it('does not keep asking about a rejected workout', async () => {
		const { submit, seen } = recorder(['rejected']);
		const queue = new SyncQueue(store, submit);

		await queue.add(payload('a'));
		await queue.drain();
		await queue.drain();

		expect(seen).toEqual(['a']);
	});

	it('tries a rejected workout again when asked explicitly', async () => {
		let outcome = 'rejected';
		const queue = new SyncQueue(store, async () => ({
			outcome: outcome as never,
			error: 'Unknown movement'
		}));

		await queue.add(payload('a'));
		expect(queue.pending).toBe(1);

		outcome = 'saved';
		await queue.retryRejected();
		expect(queue.pending).toBe(0);
		expect(queue.lastError).toBeNull();
	});

	it('counts attempts, so backoff can grow', async () => {
		const queue = new SyncQueue(store, async () => {
			throw new Error('offline');
		});
		await queue.add(payload('a'));
		queue.clearRetry();
		await queue.drain();
		queue.clearRetry();

		expect((await queue.list())[0].attempts).toBe(2);
	});

	it('survives a reload by reading the queue back', async () => {
		const queue = new SyncQueue(store, async () => {
			throw new Error('offline');
		});
		await queue.add(payload('a'));
		queue.clearRetry();

		const reopened = new SyncQueue(store, async () => ({ outcome: 'saved' }));
		await reopened.load();
		expect(reopened.pending).toBe(1);

		await reopened.drain();
		expect(reopened.pending).toBe(0);
	});
});

describe('the workout in progress', () => {
	const snapshot = {
		sessionId: 'session-1',
		dayId: 'day-b',
		startedAt: 1_700_000_000_000,
		lastAt: 1_700_000_300_000,
		active: 1,
		log: { '0|0|0': 8 }
	};

	it('comes back after a reload', async () => {
		await saveLive(store, snapshot);
		const restored = await loadLive(store, 'day-b');
		expect(restored).toMatchObject({ sessionId: 'session-1', active: 1, log: { '0|0|0': 8 } });
	});

	it('is not offered on a different day', async () => {
		await saveLive(store, snapshot);
		expect(await loadLive(store, 'day-a')).toBeNull();
	});

	it('is not offered once it is stale', async () => {
		await saveLive(store, snapshot);
		const later = Date.now() + STALE_AFTER_MS + 1000;
		// Being asked to resume last Tuesday is worse than being asked nothing.
		expect(await loadLive(store, 'day-b', later)).toBeNull();
	});

	it('keeps a paused workout well past the usual limit, but not forever', async () => {
		const pausedAt = Date.now();
		await saveLive(store, { ...snapshot, pausedAt, pausedMs: 0 });
		// Stepped away for the evening: still there the next morning.
		const nextMorning = pausedAt + STALE_AFTER_MS + 60 * 60_000;
		expect(await loadLive(store, 'day-b', nextMorning)).toMatchObject({ pausedAt });
		expect(await loadLive(store, 'day-b', pausedAt + PAUSED_STALE_AFTER_MS + 1000)).toBeNull();
	});

	it('is offered on the home screen only while it is paused', async () => {
		await saveLive(store, snapshot);
		expect(await loadPaused(store)).toBeNull();

		const pausedAt = Date.now();
		await saveLive(store, { ...snapshot, pausedAt, pausedMs: 0 });
		// Whichever day it is for: the home screen does not know which to ask about.
		expect(await loadPaused(store)).toMatchObject({ dayId: 'day-b', pausedAt });
		expect(await loadPaused(store, pausedAt + PAUSED_STALE_AFTER_MS + 1000)).toBeNull();
	});

	it('is cleared once the workout is queued', async () => {
		await saveLive(store, snapshot);
		await clearLive(store);
		expect(await loadLive(store, 'day-b')).toBeNull();
	});

	it('is gone after quitting, so the next attempt starts fresh', async () => {
		await saveLive(store, snapshot);

		// Quitting without saving discards the snapshot as well as the session.
		// Leaving it meant returning to the day resumed the abandoned workout,
		// with a session clock still counting from the original start.
		await clearLive(store);

		const resumed = await loadLive(store, 'day-b');
		expect(resumed).toBeNull();
	});

	it('does not resurrect a quit session on a different day either', async () => {
		await saveLive(store, snapshot);
		await clearLive(store);
		expect(await loadLive(store, 'day-a')).toBeNull();
		expect(await loadLive(store, 'day-b')).toBeNull();
	});
});

describe('memoryStore', () => {
	it('stores a copy, the way IndexedDB does', async () => {
		const value: QueuedSession = {
			payload: payload('a'),
			queuedAt: 1,
			attempts: 0,
			error: null
		};
		await store.put('queue', 'a', value);
		value.attempts = 99;

		const read = await store.get<QueuedSession>('queue', 'a');
		expect(read?.attempts).toBe(0);
	});
});
