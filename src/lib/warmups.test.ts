import { describe, expect, it } from 'vitest';
import { parseWarmups, suggestWarmups } from './warmups';

describe('suggestWarmups', () => {
	it('ramps up to a heavy working weight in three steps', () => {
		expect(suggestWarmups(225, 45)).toEqual([
			{ weight: 110, reps: 5 },
			{ weight: 155, reps: 3 },
			{ weight: 190, reps: 1 }
		]);
	});

	it('never goes under the empty bar, and drops steps that would repeat', () => {
		// Half of 95 is under the bar, so the first step is the bar itself.
		expect(suggestWarmups(95, 45)).toEqual([
			{ weight: 45, reps: 5 },
			{ weight: 65, reps: 3 },
			{ weight: 80, reps: 1 }
		]);
		expect(suggestWarmups(55, 45)).toEqual([{ weight: 45, reps: 5 }]);
	});

	it('suggests nothing for a weight at or under the floor', () => {
		expect(suggestWarmups(45, 45)).toEqual([]);
		expect(suggestWarmups(0)).toEqual([]);
	});
});

describe('parseWarmups', () => {
	it('reads a list from JSON or as given, and nothing as an empty list', () => {
		expect(parseWarmups('[{"weight":135,"reps":5}]')).toEqual([{ weight: 135, reps: 5 }]);
		expect(parseWarmups([{ weight: '185', reps: '3' }])).toEqual([{ weight: 185, reps: 3 }]);
		expect(parseWarmups('')).toEqual([]);
		expect(parseWarmups(undefined)).toEqual([]);
	});

	it('refuses a set with no reps, a bad weight, or too many sets', () => {
		expect(() => parseWarmups([{ weight: 135, reps: 0 }])).toThrow(/rep/);
		expect(() => parseWarmups([{ weight: -5, reps: 5 }])).toThrow(/weight/);
		expect(() => parseWarmups(Array(9).fill({ weight: 45, reps: 5 }))).toThrow(/At most/);
		expect(() => parseWarmups('{}')).toThrow(/list/);
	});
});
