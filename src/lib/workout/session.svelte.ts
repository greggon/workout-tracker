import type { Tool } from '$lib/types';

/**
 * A workout in progress.
 *
 * Held in memory and mirrored to IndexedDB after every set, so a refresh, a
 * phone call, or iOS reclaiming the tab costs nothing. The id is minted at the
 * start rather than at the end, and survives a restore, so a replayed
 * submission upserts instead of duplicating.
 */

export type SessionMovement = { movementId: string; name: string; tool: Tool; weight: number };

export type SessionExercise = {
	id: string;
	sets: number;
	reps: number;
	note: string;
	main: SessionMovement;
	pair: SessionMovement | null;
};

/** Both halves of a superset, in logging order. */
export function movementsOf(exercise: SessionExercise): SessionMovement[] {
	return exercise.pair ? [exercise.main, exercise.pair] : [exercise.main];
}

/** Matches `set_logs`: exercise index, set index, slot (0 main, 1 pair). */
export function slotKey(exerciseIndex: number, setIndex: number, slot: number): string {
	return `${exerciseIndex}|${setIndex}|${slot}`;
}

export class WorkoutSession {
	/** Idempotency key for the eventual POST. */
	id = $state<string>(crypto.randomUUID());
	startedAt = $state(Date.now());

	readonly exercises: SessionExercise[];

	/** Ticks once a second so the clocks move. */
	now = $state(Date.now());
	/** When the last set was logged — the rest clock counts from here, once
	 *  there is something to count from. */
	lastAt = $state(Date.now());
	/** Which exercise is expanded. */
	active = $state(0);
	/** Reps logged, keyed by slot. */
	log = $state<Record<string, number>>({});
	finishedAt = $state<number | null>(null);
	/**
	 * When the workout was paused, or null while it is running. Paused, both
	 * clocks stand still: stepping away for an hour should not read as an
	 * hour-long session or an hour of rest.
	 */
	pausedAt = $state<number | null>(null);
	/** Time spent paused in earlier pauses, kept out of the session's length. */
	pausedMs = $state(0);

	constructor(exercises: SessionExercise[]) {
		this.exercises = exercises;
	}

	/** Every logging slot in the day: sets × movements. */
	get totalSlots(): number {
		return this.exercises.reduce((n, ex) => n + ex.sets * movementsOf(ex).length, 0);
	}

	get loggedCount(): number {
		return Object.keys(this.log).length;
	}

	get progress(): number {
		return this.totalSlots === 0 ? 0 : this.loggedCount / this.totalSlots;
	}

	get paused(): boolean {
		return this.pausedAt !== null;
	}

	/** "Now", as far as the clocks are concerned: frozen while paused. */
	private get clockNow(): number {
		return this.pausedAt ?? this.now;
	}

	get elapsedMs(): number {
		return Math.max(0, this.clockNow - this.startedAt - this.pausedMs);
	}

	/**
	 * Zero until the first set is logged.
	 *
	 * Rest is time since the last set, so before there has been a set there is no
	 * rest to measure. It used to count from the moment the screen opened, which
	 * meant walking to the rack, loading a bar and doing your first working set
	 * all read as "resting" — the number was at four minutes before any lifting
	 * had happened, which is worse than useless next to a real rest clock.
	 */
	get restMs(): number {
		if (this.loggedCount === 0) return 0;
		return Math.max(0, this.clockNow - this.lastAt);
	}

	get complete(): boolean {
		return this.exercises.every((_, i) => this.isExerciseDone(i));
	}

	reps(exerciseIndex: number, setIndex: number, slot: number): number | undefined {
		return this.log[slotKey(exerciseIndex, setIndex, slot)];
	}

	/** True when every slot of this exercise carries a number. */
	isExerciseDone(exerciseIndex: number): boolean {
		const exercise = this.exercises[exerciseIndex];
		if (!exercise) return false;
		const slots = movementsOf(exercise).length;
		for (let s = 0; s < exercise.sets; s++) {
			for (let m = 0; m < slots; m++) {
				if (this.log[slotKey(exerciseIndex, s, m)] == null) return false;
			}
		}
		return true;
	}

	loggedIn(exerciseIndex: number): number {
		const exercise = this.exercises[exerciseIndex];
		if (!exercise) return 0;
		const slots = movementsOf(exercise).length;
		let n = 0;
		for (let s = 0; s < exercise.sets; s++) {
			for (let m = 0; m < slots; m++) {
				if (this.log[slotKey(exerciseIndex, s, m)] != null) n++;
			}
		}
		return n;
	}

	/**
	 * Records a set. Clearing the field removes the entry rather than storing a
	 * zero — a blank is "not done yet", and zero reps is a real, different thing
	 * that the design has no way to express.
	 */
	logSet(exerciseIndex: number, setIndex: number, slot: number, reps: number | null): void {
		// Logging a set is the clearest sign the break is over.
		this.resume();
		const key = slotKey(exerciseIndex, setIndex, slot);
		const next = { ...this.log };
		if (reps === null || !Number.isFinite(reps)) {
			delete next[key];
		} else {
			next[key] = Math.max(0, Math.round(reps));
		}
		this.log = next;
		this.lastAt = Date.now();
	}

	/**
	 * The exercise to open next: the first unfinished one after this, wrapping
	 * back to any earlier one that was skipped. Returns null when the day is done.
	 */
	nextUnfinished(after: number): number | null {
		for (let i = after + 1; i < this.exercises.length; i++) {
			if (!this.isExerciseDone(i)) return i;
		}
		for (let i = 0; i <= after; i++) {
			if (!this.isExerciseDone(i)) return i;
		}
		return null;
	}

	/**
	 * Restores an interrupted workout, keeping its original id and start time —
	 * a resumed session must submit as the same session, or a partial commit
	 * that did land would end up duplicated.
	 */
	adopt(saved: {
		sessionId: string;
		startedAt: number;
		lastAt: number;
		active: number;
		log: Record<string, number>;
		/** Absent from snapshots saved before pausing existed. */
		pausedAt?: number | null;
		pausedMs?: number;
		/**
		 * The day's exercise ids, in order, when the snapshot was taken. Logged
		 * sets are keyed by position, and the day can be edited mid-workout —
		 * reordered, an exercise added or dropped — so positions are matched
		 * back up by id. Absent from older snapshots, which are taken as-is.
		 */
		exerciseIds?: string[];
	}): void {
		this.id = saved.sessionId;
		this.startedAt = saved.startedAt;
		this.lastAt = saved.lastAt;
		const moved = saved.exerciseIds ? this.remap(saved.exerciseIds) : null;
		this.log = moved ? moved.log(saved.log) : { ...saved.log };
		this.active = moved ? moved.index(saved.active) : saved.active;
		this.pausedAt = saved.pausedAt ?? null;
		this.pausedMs = saved.pausedMs ?? 0;
	}

	/**
	 * Maps a snapshot taken against an earlier version of the day onto this
	 * one. A set whose exercise is gone, or that falls past the exercise's
	 * current set count or movement count, is dropped rather than landing on
	 * something else.
	 */
	private remap(savedIds: string[]) {
		/** Where the exercise that was at `old` is now; -1 if it is gone. */
		const position = (old: number): number =>
			this.exercises.findIndex((e) => e.id === savedIds[old]);
		const index = (old: number): number => Math.max(0, position(old));
		const log = (saved: Record<string, number>): Record<string, number> => {
			const next: Record<string, number> = {};
			for (const [key, reps] of Object.entries(saved)) {
				const [oldIndex, setIndex, slot] = key.split('|').map(Number);
				const newIndex = position(oldIndex);
				if (newIndex < 0) continue;
				const exercise = this.exercises[newIndex];
				if (setIndex >= exercise.sets || slot >= movementsOf(exercise).length) continue;
				next[slotKey(newIndex, setIndex, slot)] = reps;
			}
			return next;
		};
		return { index, log };
	}

	pause(at = Date.now()): void {
		if (this.pausedAt !== null || this.finishedAt !== null) return;
		this.pausedAt = at;
	}

	/**
	 * Ends a pause. The break comes out of the session's length, and the rest
	 * clock picks up where it stopped — moving the last set forward by the
	 * length of the break is what makes it read as if no time had passed.
	 */
	resume(at = Date.now()): void {
		if (this.pausedAt === null) return;
		const gap = Math.max(0, at - this.pausedAt);
		this.pausedMs += gap;
		this.lastAt += gap;
		this.pausedAt = null;
	}

	finish(): void {
		// Finishing from a pause counts the pause as a pause, not as training.
		this.resume();
		this.finishedAt = Date.now();
	}

	get durationMins(): number {
		const end = this.finishedAt ?? this.clockNow;
		return Math.max(1, Math.round((end - this.startedAt - this.pausedMs) / 60_000));
	}
}

/**
 * What the screen should do once a set has been written.
 *
 * `stay` is the important one: it is what makes a finished exercise editable.
 * Going back to fix a rep count you fat-fingered logs a set against an exercise
 * that is already complete, and if that moved you on, the card would jump out
 * from under you the moment you touched it.
 */
export type NextStep = { kind: 'stay' } | { kind: 'open'; index: number } | { kind: 'finish' };

/** A step that actually moves the screen — everything except staying put. */
export type Advance = Exclude<NextStep, { kind: 'stay' }>;

/** How a set reached the log: tapping its rep chip, or typing a number. */
export type LogSource = 'tap' | 'typed';

export type Logged = { completed: boolean; source: LogSource };

/**
 * How long to wait before acting on a completed exercise.
 *
 * A tap on a rep chip logs the target, but the next tap on the same chip takes
 * a rep off — so a set that fell two short is three quick taps, and the
 * exercise is "complete" after the first of them. The wait has to outlast the
 * gap between those taps, or the card would move on before the correction
 * lands. Every further tap restarts it. Typing is similar: reps go in a digit at a time, and an
 * exercise is briefly complete at "1" on the way to "11". The wait has to
 * outlast the gap between two digits of someone wearing gloves with a phone
 * balanced on a bench — half a second does not, which is how a workout finished
 * itself mid-number.
 *
 * Any further input cancels a pending move, so this only ever delays the case
 * where the lifter has genuinely stopped typing.
 */
export const ADVANCE_DELAY_MS: Record<LogSource, number> = {
	tap: 800,
	typed: 2500
};

/**
 * What one tap on a rep chip writes.
 *
 * Unlogged → the target, because hitting it is the common case and should be
 * one tap. Logged → one fewer, so a set that came up short is a tap per missed
 * rep. At zero → cleared, so a set tapped by mistake can be tapped back to
 * "not done" without a separate control. Going over the target is what the
 * press-and-hold number field is for.
 */
export function tapReps(current: number | undefined, target: number): number | null {
	if (current == null) return target;
	if (current > 0) return current - 1;
	return null;
}

/**
 * The wait once the lifter says they are finished typing — the keypad's Done
 * key, or a tap anywhere else on the screen.
 *
 * That is the signal that actually matters on a phone: the number pad covers
 * half the screen, so dismissing it is a deliberate act, and waiting out the
 * typed backstop after that reads as the screen having simply stopped working.
 * Short, but not zero — a tap that lands on another control cancels the move
 * instead of racing it.
 */
export const ADVANCE_ON_COMMIT_MS = 200;

/**
 * `completed` means this particular write is what finished the exercise — not
 * merely that the exercise is finished, which is also true of every correction
 * made afterwards.
 *
 * `waiting` says a move for this same exercise is already pending, which is the
 * difference between a correction and the rest of a number. Typing 12 into the
 * last empty slot finishes the exercise at "1" and then writes again with the
 * "2": that second write did not complete anything, but a move is already
 * waiting on it, so it is still the same set being entered. Without this a
 * two-digit rep count on a final set cancelled its own advance and the screen
 * sat there — every number under ten moved on, everything from ten up did not.
 */
export function stepAfterLog(
	session: WorkoutSession,
	index: number,
	completed: boolean,
	waiting = false
): NextStep {
	if (!session.isExerciseDone(index)) return { kind: 'stay' };
	if (!completed && !waiting) return { kind: 'stay' };
	const next = session.nextUnfinished(index);
	return next === null ? { kind: 'finish' } : { kind: 'open', index: next };
}

/** mm:ss, or h:mm:ss once a session runs past an hour. */
export function clock(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = String(total % 60).padStart(2, '0');
	if (minutes > 59) {
		return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`;
	}
	return `${minutes}:${seconds}`;
}
