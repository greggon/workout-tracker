import { describe, expect, it } from 'vitest';
import {
	clock,
	movementsOf,
	slotKey,
	stepAfterLog,
	WorkoutSession,
	type SessionExercise
} from './session.svelte';

const movement = (name: string, weight: number) => ({
	movementId: name,
	name,
	tool: 'barbell' as const,
	weight
});

/** Day A's shape: a superset, then a single. */
function exercises(): SessionExercise[] {
	return [
		{
			id: 'a',
			sets: 2,
			reps: 10,
			note: '',
			main: movement('Landmine row', 41),
			pair: movement('Incline press', 40)
		},
		{ id: 'b', sets: 3, reps: 12, note: '', main: movement('Face pulldown', 102), pair: null }
	];
}

const fresh = () => new WorkoutSession(exercises());

/** Fills every slot of one exercise at the prescribed reps. */
function completeExercise(session: WorkoutSession, index: number) {
	const exercise = session.exercises[index];
	const slots = movementsOf(exercise).length;
	for (let s = 0; s < exercise.sets; s++) {
		for (let m = 0; m < slots; m++) session.logSet(index, s, m, exercise.reps);
	}
}

describe('slot accounting', () => {
	it('counts a slot per set per movement', () => {
		// The superset needs 4 entries, the single 3.
		expect(fresh().totalSlots).toBe(7);
	});

	it('keys slots the way set_logs does', () => {
		expect(slotKey(1, 2, 0)).toBe('1|2|0');
	});

	it('tracks progress as slots fill', () => {
		const session = fresh();
		expect(session.progress).toBe(0);
		session.logSet(0, 0, 0, 10);
		expect(session.progress).toBeCloseTo(1 / 7, 10);
	});
});

describe('logging a set', () => {
	it('records reps and moves the rest clock', () => {
		const session = fresh();
		const before = session.lastAt;
		session.now = before + 5000;
		session.logSet(0, 0, 0, 9);
		expect(session.reps(0, 0, 0)).toBe(9);
		expect(session.lastAt).toBeGreaterThanOrEqual(before);
	});

	it('clears the entry when the field is emptied', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 9);
		session.logSet(0, 0, 0, null);
		// Not zero: blank means "not done", and zero reps is a different claim.
		expect(session.reps(0, 0, 0)).toBeUndefined();
		expect(session.loggedCount).toBe(0);
	});

	it('keeps a deliberate zero', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 0);
		expect(session.reps(0, 0, 0)).toBe(0);
		expect(session.loggedCount).toBe(1);
	});

	it('rounds and floors what the field hands it', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 8.6);
		expect(session.reps(0, 0, 0)).toBe(9);
		session.logSet(0, 0, 1, -3);
		expect(session.reps(0, 0, 1)).toBe(0);
	});
});

describe('completion', () => {
	it('needs both halves of a superset before an exercise is done', () => {
		const session = fresh();
		for (let s = 0; s < 2; s++) session.logSet(0, s, 0, 10);
		expect(session.isExerciseDone(0)).toBe(false);
		for (let s = 0; s < 2; s++) session.logSet(0, s, 1, 10);
		expect(session.isExerciseDone(0)).toBe(true);
	});

	it('is only complete when every exercise is', () => {
		const session = fresh();
		completeExercise(session, 0);
		expect(session.complete).toBe(false);
		completeExercise(session, 1);
		expect(session.complete).toBe(true);
	});
});

describe('auto-advance', () => {
	it('moves to the next unfinished exercise', () => {
		const session = fresh();
		completeExercise(session, 0);
		expect(session.nextUnfinished(0)).toBe(1);
	});

	it('wraps back to an exercise that was skipped', () => {
		const session = fresh();
		// Finish the second one first, as happens when equipment is busy.
		completeExercise(session, 1);
		expect(session.nextUnfinished(1)).toBe(0);
	});

	it('returns null once the day is done, which is what ends it', () => {
		const session = fresh();
		completeExercise(session, 0);
		completeExercise(session, 1);
		expect(session.nextUnfinished(1)).toBeNull();
	});
});

describe('clocks', () => {
	it('counts from timestamps, so backgrounding cannot drift them', () => {
		const session = fresh();
		session.now = session.startedAt + 95_000;
		expect(clock(session.elapsedMs)).toBe('1:35');
	});

	it('pads seconds and grows an hours field', () => {
		expect(clock(0)).toBe('0:00');
		expect(clock(9_000)).toBe('0:09');
		expect(clock(3_600_000)).toBe('1:00:00');
		expect(clock(3_725_000)).toBe('1:02:05');
	});

	it('never reports a negative clock', () => {
		expect(clock(-5000)).toBe('0:00');
	});

	it('never reports a zero-minute session', () => {
		const session = fresh();
		session.finish();
		expect(session.durationMins).toBeGreaterThanOrEqual(1);
	});
});

describe('what happens after a set is logged', () => {
	/** Logs one slot the way the card does, reporting whether it finished the exercise. */
	function log(
		session: WorkoutSession,
		index: number,
		set: number,
		slot: number,
		reps: number | null
	) {
		const wasDone = session.isExerciseDone(index);
		session.logSet(index, set, slot, reps);
		return !wasDone && session.isExerciseDone(index);
	}

	it('stays put while an exercise is still unfinished', () => {
		const session = fresh();
		const completed = log(session, 0, 0, 0, 10);
		expect(stepAfterLog(session, 0, completed)).toEqual({ kind: 'stay' });
	});

	it('opens the next exercise when one is finished', () => {
		const session = fresh();
		completeExercise(session, 0);
		expect(stepAfterLog(session, 0, true)).toEqual({ kind: 'open', index: 1 });
	});

	it('finishes the day when nothing is left', () => {
		const session = fresh();
		completeExercise(session, 0);
		completeExercise(session, 1);
		expect(stepAfterLog(session, 1, true)).toEqual({ kind: 'finish' });
	});

	it('stays put when a finished exercise is corrected', () => {
		const session = fresh();
		completeExercise(session, 0);

		// Going back to fix a rep count. The exercise was already done, so this
		// write did not complete it — and moving on would pull the card out from
		// under the correction being typed into it.
		const completed = log(session, 0, 0, 0, 8);
		expect(completed).toBe(false);
		expect(session.reps(0, 0, 0)).toBe(8);
		expect(stepAfterLog(session, 0, completed)).toEqual({ kind: 'stay' });
	});

	it('stays put when a correction empties a slot, and moves on once it is filled again', () => {
		const session = fresh();
		completeExercise(session, 0);

		// Clearing the field to retype it reopens the exercise…
		const cleared = log(session, 0, 1, 1, null);
		expect(cleared).toBe(false);
		expect(session.isExerciseDone(0)).toBe(false);
		expect(stepAfterLog(session, 0, cleared)).toEqual({ kind: 'stay' });

		// …and putting a number back finishes it again, which does move on.
		const refilled = log(session, 0, 1, 1, 9);
		expect(refilled).toBe(true);
		expect(stepAfterLog(session, 0, refilled)).toEqual({ kind: 'open', index: 1 });
	});

	it('never finishes the day twice over a correction', () => {
		const session = fresh();
		completeExercise(session, 0);
		completeExercise(session, 1);

		// Every exercise is done, so nextUnfinished has nothing to offer. A
		// correction must not be read as the last set landing all over again.
		const completed = log(session, 1, 0, 0, 11);
		expect(stepAfterLog(session, 1, completed)).toEqual({ kind: 'stay' });
	});
});
