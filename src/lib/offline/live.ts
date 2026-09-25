import type { OfflineStore } from './store';

/**
 * A snapshot of the workout in progress.
 *
 * Kept because the alternative is losing a session to a pull-to-refresh, a
 * phone call, or iOS reclaiming a backgrounded tab — all of which happen in a
 * gym, and all of which currently cost the whole workout.
 */

export type LiveSession = {
	sessionId: string;
	dayId: string;
	startedAt: number;
	lastAt: number;
	active: number;
	log: Record<string, number>;
	/** Set while the workout is paused. Absent from older snapshots. */
	pausedAt?: number | null;
	/** Time already spent in earlier pauses. */
	pausedMs?: number;
	/** The day's exercise ids in order, so an edited day can be matched up. */
	exerciseIds?: string[];
	savedAt: number;
};

const KEY = 'current';

/** Abandoned sessions older than this are not worth offering to resume. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
/**
 * A paused session was put down on purpose, to be picked up later — so it
 * keeps for longer than one that was simply left, measured from the pause.
 */
export const PAUSED_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export async function saveLive(
	store: OfflineStore,
	snapshot: Omit<LiveSession, 'savedAt'>
): Promise<void> {
	await store.put('live', KEY, { ...snapshot, savedAt: Date.now() });
}

export async function clearLive(store: OfflineStore): Promise<void> {
	await store.delete('live', KEY);
}

/**
 * The saved session, if it is for this day and recent enough to be worth
 * resuming. A stale one is dropped rather than offered — being asked to resume
 * last Tuesday is worse than being asked nothing.
 */
export async function loadLive(
	store: OfflineStore,
	dayId: string,
	now = Date.now()
): Promise<LiveSession | null> {
	const saved = await store.get<LiveSession>('live', KEY);
	if (!saved || saved.dayId !== dayId || isStale(saved, now)) return null;
	return saved;
}

/**
 * The paused workout, whichever day it is for — what the home screen offers
 * to resume. Null when nothing is paused, or the pause has gone stale.
 */
export async function loadPaused(
	store: OfflineStore,
	now = Date.now()
): Promise<LiveSession | null> {
	const saved = await store.get<LiveSession>('live', KEY);
	if (!saved || saved.pausedAt == null || isStale(saved, now)) return null;
	return saved;
}

function isStale(saved: LiveSession, now: number): boolean {
	return saved.pausedAt != null
		? now - saved.pausedAt > PAUSED_STALE_AFTER_MS
		: now - saved.savedAt > STALE_AFTER_MS;
}
