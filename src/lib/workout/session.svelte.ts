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
	/** When the last set was logged — the rest clock counts from here. */
	lastAt = $state(Date.now());
	/** Which exercise is expanded. */
	active = $state(0);
	/** Reps logged, keyed by slot. */
	log = $state<Record<string, number>>({});
	finishedAt = $state<number | null>(null);

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

	get elapsedMs(): number {
		return Math.max(0, this.now - this.startedAt);
	}

	get restMs(): number {
		return Math.max(0, this.now - this.lastAt);
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
	}): void {
		this.id = saved.sessionId;
		this.startedAt = saved.startedAt;
		this.lastAt = saved.lastAt;
		this.active = saved.active;
		this.log = { ...saved.log };
	}

	finish(): void {
		this.finishedAt = Date.now();
	}

	get durationMins(): number {
		const end = this.finishedAt ?? this.now;
		return Math.max(1, Math.round((end - this.startedAt) / 60_000));
	}
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
