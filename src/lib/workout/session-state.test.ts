import { describe, expect, it } from 'vitest';
import {
	ADVANCE_DELAY_MS,
	ADVANCE_ON_COMMIT_MS,
	clock,
	movementsOf,
	slotKey,
	stepAfterLog,
	tapReps,
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

	it('still moves on when the last set is a two-digit number', () => {
		const session = fresh();
		// Everything but the very last slot of the superset.
		session.logSet(0, 0, 0, 10);
		session.logSet(0, 0, 1, 10);
		session.logSet(0, 1, 0, 10);

		// Typing 12 arrives a digit at a time. The "1" finishes the exercise and
		// arms the move…
		const first = log(session, 0, 1, 1, 1);
		expect(first).toBe(true);
		expect(stepAfterLog(session, 0, first)).toEqual({ kind: 'open', index: 1 });

		// …and the "2" is the rest of the same number, not a correction: without
		// the waiting flag it cancelled the armed move and the screen never
		// advanced, which every rep count of ten or more hit.
		const second = log(session, 0, 1, 1, 12);
		expect(second).toBe(false);
		expect(stepAfterLog(session, 0, second)).toEqual({ kind: 'stay' });
		expect(stepAfterLog(session, 0, second, true)).toEqual({ kind: 'open', index: 1 });
	});

	it('ends the day on a two-digit last rep of the last exercise', () => {
		const session = fresh();
		completeExercise(session, 0);
		session.logSet(1, 0, 0, 12);
		session.logSet(1, 1, 0, 12);

		const first = log(session, 1, 2, 0, 1);
		expect(stepAfterLog(session, 1, first)).toEqual({ kind: 'finish' });

		const second = log(session, 1, 2, 0, 12);
		expect(stepAfterLog(session, 1, second, true)).toEqual({ kind: 'finish' });
	});

	it('leaves a correction alone even when a move is waiting on another exercise', () => {
		const session = fresh();
		completeExercise(session, 0);

		// The waiting flag is per exercise: a move armed by exercise 0 must not
		// make a later touch of exercise 0 — after the move has been applied and
		// forgotten — read as anything but a correction.
		const completed = log(session, 0, 0, 0, 8);
		expect(stepAfterLog(session, 0, completed, false)).toEqual({ kind: 'stay' });
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

describe('the rest clock', () => {
	it('stays at zero until the first set is logged', () => {
		const session = fresh();
		// Four minutes of walking to the rack and loading a bar is not rest.
		session.now = session.startedAt + 4 * 60_000;
		expect(session.restMs).toBe(0);
		expect(clock(session.restMs)).toBe('0:00');

		// The session clock is running the whole time, which is the point of
		// having two of them.
		expect(session.elapsedMs).toBe(4 * 60_000);
	});

	it('starts counting from the first logged set', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 10);
		const logged = session.lastAt;
		session.now = logged + 90_000;
		expect(session.restMs).toBe(90_000);
	});

	it('resets with every set after that', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 10);
		session.now = session.lastAt + 90_000;
		expect(session.restMs).toBe(90_000);

		// logSet stamps lastAt from the real clock; the once-a-second tick is what
		// moves `now` up to meet it, so the test does that tick itself.
		session.logSet(0, 0, 1, 10);
		session.now = session.lastAt;
		expect(session.restMs).toBe(0);
	});

	it('is back to zero if every set is cleared again', () => {
		const session = fresh();
		session.logSet(0, 0, 0, 10);
		session.logSet(0, 0, 0, null);
		session.now = session.lastAt + 60_000;
		expect(session.restMs).toBe(0);
	});

	it('keeps counting across a resumed session', () => {
		const session = fresh();
		session.adopt({
			sessionId: 'abc',
			startedAt: 1_700_000_000_000,
			lastAt: 1_700_000_300_000,
			active: 1,
			log: { '0|0|0': 8 }
		});
		session.now = 1_700_000_400_000;
		// A workout picked up after a reload has already had a set logged, so the
		// rest clock has something to count from.
		expect(session.restMs).toBe(100_000);
	});
});

describe('how long the screen waits before moving on', () => {
	it('gives a typed number long enough to finish typing it', () => {
		// The bug this guards: entering 11 on the last set of the last exercise
		// completed the day at "1" and committed the workout while the second
		// digit was still coming. Anything under a couple of seconds is shorter
		// than a real gap between two digits, gloves on, phone on a bench.
		expect(ADVANCE_DELAY_MS.typed).toBeGreaterThanOrEqual(2000);
	});

	it('acts almost at once when the lifter says they are done', () => {
		// Dismissing the number pad, or tapping away from the field, is the signal
		// that matters on a phone. Waiting out the typed backstop after that reads
		// as the screen having stopped working — which is what it did.
		expect(ADVANCE_ON_COMMIT_MS).toBeLessThan(ADVANCE_DELAY_MS.typed);
		expect(ADVANCE_ON_COMMIT_MS).toBeLessThanOrEqual(300);
		// Not zero: a tap heading for another control has to be able to cancel it
		// rather than race it.
		expect(ADVANCE_ON_COMMIT_MS).toBeGreaterThan(0);
	});

	it('waits long enough after a tap for the next tap to take a rep off', () => {
		// The first tap on the last chip completes the exercise; a set that fell
		// short is more taps on the same chip. Moving on before those land would
		// yank the card away mid-correction.
		// Quick taps land a few hundred ms apart.
		expect(ADVANCE_DELAY_MS.tap).toBeGreaterThanOrEqual(700);
		// …but a tap is still a finished gesture, unlike a number half typed.
		expect(ADVANCE_DELAY_MS.tap).toBeLessThan(ADVANCE_DELAY_MS.typed);
	});
});

describe('tapping a rep chip', () => {
	it('logs the target on the first tap', () => {
		expect(tapReps(undefined, 12)).toBe(12);
	});

	it('takes one rep off with each further tap', () => {
		expect(tapReps(12, 12)).toBe(11);
		expect(tapReps(11, 12)).toBe(10);
		// Also below a number that was typed over the target.
		expect(tapReps(15, 12)).toBe(14);
	});

	it('clears the set after zero, so a mistaken tap can be undone', () => {
		expect(tapReps(1, 12)).toBe(0);
		expect(tapReps(0, 12)).toBeNull();
	});
});

describe('pausing', () => {
	const MIN = 60_000;

	/** A session 10 minutes in, with a set logged 2 minutes ago. */
	function underway() {
		const session = fresh();
		const start = session.startedAt;
		session.logSet(0, 0, 0, 10);
		session.lastAt = start + 8 * MIN;
		session.now = start + 10 * MIN;
		return { session, start };
	}

	it('stops both clocks', () => {
		const { session, start } = underway();
		session.pause(start + 10 * MIN);
		session.now = start + 70 * MIN;
		expect(session.paused).toBe(true);
		expect(session.elapsedMs).toBe(10 * MIN);
		expect(session.restMs).toBe(2 * MIN);
	});

	it('leaves the break out of the session and picks rest up where it stopped', () => {
		const { session, start } = underway();
		session.pause(start + 10 * MIN);
		session.resume(start + 70 * MIN);
		session.now = start + 71 * MIN;
		expect(session.paused).toBe(false);
		expect(session.elapsedMs).toBe(11 * MIN);
		expect(session.restMs).toBe(3 * MIN);
	});

	it('adds up more than one pause', () => {
		const { session, start } = underway();
		session.pause(start + 10 * MIN);
		session.resume(start + 20 * MIN);
		session.pause(start + 30 * MIN);
		session.resume(start + 45 * MIN);
		expect(session.pausedMs).toBe(25 * MIN);
	});

	it('resumes on its own when a set is logged', () => {
		const { session } = underway();
		// Logging uses the real clock, so the pause has to be in the past.
		session.pause(Date.now() - 5 * MIN);
		session.logSet(0, 0, 1, 10);
		expect(session.paused).toBe(false);
		expect(session.pausedMs).toBeGreaterThanOrEqual(5 * MIN);
	});

	it('keeps the break out of the finished duration', () => {
		const { session, start } = underway();
		session.pause(start + 10 * MIN);
		session.resume(start + 70 * MIN);
		session.finishedAt = start + 80 * MIN;
		expect(session.durationMins).toBe(20);
	});

	it('comes back paused from a saved snapshot, and from an older one without it', () => {
		const session = fresh();
		const base = { sessionId: 's', startedAt: 1, lastAt: 1, active: 0, log: {} };
		session.adopt({ ...base, pausedAt: 500, pausedMs: 1000 });
		expect(session.pausedAt).toBe(500);
		expect(session.pausedMs).toBe(1000);
		session.adopt(base);
		expect(session.paused).toBe(false);
		expect(session.pausedMs).toBe(0);
	});
});

describe('coming back to a workout after editing its day', () => {
	const base = { sessionId: 's', startedAt: 1, lastAt: 1, active: 1 };

	it('follows each set to its exercise when the day was reordered', () => {
		// Saved with the single ('b') second; the day now has it first.
		const reordered = new WorkoutSession([exercises()[1], exercises()[0]]);
		reordered.adopt({
			...base,
			exerciseIds: ['a', 'b'],
			log: { '0|0|0': 10, '0|0|1': 9, '1|2|0': 12 }
		});
		expect(reordered.log).toEqual({ '1|0|0': 10, '1|0|1': 9, '0|2|0': 12 });
		// Still on the same exercise, now in first place.
		expect(reordered.active).toBe(0);
	});

	it('drops sets for an exercise that was removed, or past its new set count', () => {
		const [superset, single] = exercises();
		const trimmed = new WorkoutSession([{ ...single, sets: 2 }]);
		trimmed.adopt({
			...base,
			exerciseIds: [superset.id, single.id],
			log: { '0|0|0': 10, '1|0|0': 12, '1|2|0': 12 }
		});
		expect(trimmed.log).toEqual({ '0|0|0': 12 });
	});

	it('takes an older snapshot without ids as it is', () => {
		const session = fresh();
		session.adopt({ ...base, log: { '1|0|0': 12 } });
		expect(session.log).toEqual({ '1|0|0': 12 });
	});
});
