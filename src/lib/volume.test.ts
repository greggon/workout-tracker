import { describe, expect, it } from 'vitest';
import {
	formatMinutes,
	formatVolume,
	formatWeight,
	plannedSets,
	plannedVolume,
	relativeDay,
	rotateFrom,
	setVolume,
	toolMultiplier,
	totalSlots,
	type PlannedExercise
} from './volume';

describe('toolMultiplier', () => {
	it('doubles dumbbells and nothing else', () => {
		expect(toolMultiplier('dumbbell')).toBe(2);
		expect(toolMultiplier('barbell')).toBe(1);
		expect(toolMultiplier('machine')).toBe(1);
		expect(toolMultiplier('pulley')).toBe(1);
	});
});

describe('setVolume', () => {
	it('counts both dumbbells', () => {
		// 40 lb in each hand for 10 reps is 800 lb moved, not 400.
		expect(setVolume({ tool: 'dumbbell', weight: 40 }, 10)).toBe(800);
		expect(setVolume({ tool: 'barbell', weight: 40 }, 10)).toBe(400);
	});

	it('handles half-pound loads without drift', () => {
		expect(setVolume({ tool: 'barbell', weight: 117.5 }, 8)).toBe(940);
	});

	it('is zero for zero reps', () => {
		expect(setVolume({ tool: 'barbell', weight: 225 }, 0)).toBe(0);
	});
});

describe('plannedVolume', () => {
	// Day A's opening superset from the design: landmine row at 41 lb paired
	// with an incline dumbbell press at 40, 2 sets of 10.
	const superset: PlannedExercise = {
		sets: 2,
		reps: 10,
		movements: [
			{ tool: 'barbell', weight: 41 },
			{ tool: 'dumbbell', weight: 40 }
		]
	};

	it('counts both halves of a superset', () => {
		// (41 × 1 × 10 + 40 × 2 × 10) × 2 sets
		expect(plannedVolume([superset])).toBe(2420);
	});

	it('sums across exercises', () => {
		const single: PlannedExercise = {
			sets: 3,
			reps: 12,
			movements: [{ tool: 'pulley', weight: 102 }]
		};
		expect(plannedVolume([superset, single])).toBe(2420 + 3672);
	});

	it('is zero for an empty day', () => {
		expect(plannedVolume([])).toBe(0);
	});

	it('counts an exercise once per set regardless of pairing', () => {
		expect(plannedSets([superset, { sets: 3, reps: 12, movements: [] }])).toBe(5);
	});

	it('counts a logging slot per set per movement', () => {
		// The superset needs 4 entries; a 3-set single needs 3.
		expect(totalSlots([superset])).toBe(4);
		expect(
			totalSlots([superset, { sets: 3, reps: 12, movements: [{ tool: 'machine', weight: 90 }] }])
		).toBe(7);
	});
});

describe('rotateFrom', () => {
	const days = [{ key: 'A' }, { key: 'B' }, { key: 'C' }];

	it('puts the day after the last finished one first', () => {
		expect(rotateFrom(days, 'B').map((d) => d.key)).toEqual(['C', 'A', 'B']);
	});

	it('wraps around the end of the rotation', () => {
		expect(rotateFrom(days, 'C').map((d) => d.key)).toEqual(['A', 'B', 'C']);
	});

	it('keeps the routine order when there is no history', () => {
		expect(rotateFrom(days, null).map((d) => d.key)).toEqual(['A', 'B', 'C']);
	});

	it('keeps the routine order when the last day no longer exists', () => {
		// Shrinking a 4-day split to 3 leaves history pointing at a gone day.
		expect(rotateFrom(days, 'D').map((d) => d.key)).toEqual(['A', 'B', 'C']);
	});
});

describe('formatting', () => {
	it('prints whole weights without a decimal and halves with one', () => {
		expect(formatWeight(45)).toBe('45');
		expect(formatWeight(117.5)).toBe('117.5');
		expect(formatWeight(2.5)).toBe('2.5');
	});

	it('groups volume figures and drops fractions', () => {
		expect(formatVolume(8100)).toBe('8,100');
		expect(formatVolume(8100.4)).toBe('8,100');
	});

	it('never reports a zero-minute session', () => {
		expect(formatMinutes(0)).toBe('1 min');
		expect(formatMinutes(52)).toBe('52 min');
	});
});

describe('relativeDay', () => {
	const now = new Date('2026-09-14T12:00:00Z').getTime();
	const days = (n: number) => now - n * 86_400_000;

	it('names today and yesterday', () => {
		expect(relativeDay(days(0), now)).toBe('today');
		expect(relativeDay(days(1), now)).toBe('yesterday');
	});

	it('counts days beyond that', () => {
		expect(relativeDay(days(9), now)).toBe('9 days ago');
	});

	it('treats a future timestamp as today rather than negative days', () => {
		expect(relativeDay(now + 86_400_000, now)).toBe('today');
	});
});
