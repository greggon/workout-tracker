import { describe, expect, it } from 'vitest';
import {
	describeLoading,
	describeStock,
	fillPlates,
	isUnloadable,
	loadingLabel,
	normalizeStock,
	perSideStock,
	plateColors,
	type LoadingConfig
} from './plates';
import { DEFAULT_PLATE_COLOR, TOOL_SPEC, type PlateStock } from './types';

/** Plenty of everything — what the design assumed. */
const many = (...weights: number[]): PlateStock[] =>
	weights.map((weight) => ({ weight, count: 20, color: DEFAULT_PLATE_COLOR }));

/** A plate row with the default colour, for the count-focused tests. */
const plate = (weight: number, count: number, color = DEFAULT_PLATE_COLOR): PlateStock => ({
	weight,
	count,
	color
});

const RACK: LoadingConfig = {
	barWeight: 45,
	ezBarWeight: 30,
	inventory: many(45, 35, 25, 10, 5, 2.5)
};

/** A sparse home set, for the cases greedy used to get wrong. */
const GARAGE: LoadingConfig = {
	barWeight: 45,
	ezBarWeight: 30,
	inventory: many(45, 25, 10)
};

/** Greg's actual gym: standard plates, micro plates, and finite counts. */
const HOME: LoadingConfig = {
	barWeight: 45,
	ezBarWeight: 30,
	inventory: [
		plate(45, 6),
		plate(35, 2),
		plate(25, 4),
		plate(10, 4),
		plate(5, 3),
		plate(2.5, 4),
		plate(1, 4),
		plate(0.75, 4),
		plate(0.5, 4),
		plate(0.25, 4)
	]
};

/** Per-sleeve view of a two-sleeve bar, for the low-level fill tests. */
const bothSleeves = (config: LoadingConfig) => perSideStock(config.inventory, 2);

describe('normalizeStock', () => {
	it('sorts heaviest first, merges duplicates, and drops junk', () => {
		expect(
			normalizeStock([
				plate(10, 2),
				plate(45, 6),
				plate(10, 2),
				plate(0, 4),
				plate(25, 0),
				{ weight: -5, count: 2 },
				'nonsense'
			])
		).toEqual([plate(45, 6), plate(10, 4)]);
	});

	it('reads accounts saved before counts existed', () => {
		// Bare numbers meant "commercial rack"; they must not become a pair.
		expect(normalizeStock([45, 25])).toEqual([plate(45, 10), plate(25, 10)]);
	});
});

describe('perSideStock', () => {
	it('halves the pile for a two-sleeve bar', () => {
		expect(perSideStock([plate(45, 6)], 2)).toEqual([plate(45, 3)]);
	});

	it('leaves the whole pile to a single-sleeve tool', () => {
		// A landmine or a machine loads one end, so nothing is held back.
		expect(perSideStock([plate(45, 6)], 1)).toEqual([plate(45, 6)]);
	});

	it('drops a denomination you own an odd single of', () => {
		expect(perSideStock([plate(35, 1)], 2)).toEqual([]);
	});
});

describe('fillPlates', () => {
	it('uses the fewest plates, which is not what greedy picks', () => {
		// Greedy: 45 + 10 + 5. Two beats three, and it is 165 on the bar.
		expect(fillPlates(60, bothSleeves(RACK))).toEqual({ plates: [35, 25], remainder: 0 });
	});

	it('combines small plates rather than declaring a weight unloadable', () => {
		// Greedy took the 25, found nothing for the last 5, and gave up.
		expect(fillPlates(30, bothSleeves(GARAGE))).toEqual({
			plates: [10, 10, 10],
			remainder: 0
		});
	});

	it('does not lose a plate to floating point', () => {
		const fill = fillPlates(46.25, bothSleeves(RACK));
		expect(fill.plates).toEqual([45]);
		expect(fill.remainder).toBeCloseTo(1.25, 10);
	});

	it('reports a shortfall when nothing on hand is light enough', () => {
		const fill = fillPlates(5, bothSleeves(GARAGE));
		expect(fill.plates).toEqual([]);
		expect(fill.remainder).toBeCloseTo(5, 10);
	});

	it('returns nothing for an empty or zero load', () => {
		expect(fillPlates(0, bothSleeves(RACK))).toEqual({ plates: [], remainder: 0 });
		expect(fillPlates(100, [])).toEqual({ plates: [], remainder: 100 });
	});

	it('matches an independently computed optimum at every quarter pound', () => {
		// The implementation reduces by the gcd and reconstructs from a pick
		// table; either step could be subtly wrong without this cross-check.
		const unlimited = HOME.inventory.map((s) => ({ ...s, count: 999 }));
		const units = unlimited.map((s) => Math.round(s.weight * 4));
		const LIMIT = 4 * 120;
		const best = new Array<number>(LIMIT + 1).fill(Infinity);
		best[0] = 0;
		for (let target = 1; target <= LIMIT; target++) {
			for (const u of units) {
				if (u <= target) best[target] = Math.min(best[target], best[target - u] + 1);
			}
		}
		for (let target = 1; target <= LIMIT; target++) {
			const fill = fillPlates(target / 4, unlimited);
			expect(fill.remainder).toBeCloseTo(0, 6);
			expect(fill.plates.length).toBe(best[target]);
		}
	});
});

describe('the bars', () => {
	it('loads a barbell on both sleeves off a 45 lb base', () => {
		const load = describeLoading('barbell', 225, HOME);
		expect(load).toMatchObject({ kind: 'loaded', sleeves: 2, base: 45, perSleeve: 90 });
		expect(loadingLabel('barbell', 225, HOME)).toBe('225 lb · 45 + 45 per side');
	});

	it('puts every landmine plate on one end', () => {
		// 135 on a landmine is 90 over the bar, all on a single sleeve — not
		// 45 a side, which is what a barbell would want.
		const load = describeLoading('landmine', 135, HOME);
		expect(load).toMatchObject({ sleeves: 1, base: 45, perSleeve: 90 });
		expect(loadingLabel('landmine', 135, HOME)).toBe('135 lb · 45 + 45 on the end');
	});

	it('lets a landmine draw on the whole pile, since only one end loads', () => {
		// Four 45s on one end is fine with six in the gym; a barbell could not.
		const load = describeLoading('landmine', 225, HOME);
		if (load.kind !== 'loaded') throw new Error('unreachable');
		expect(load.plates.filter((p) => p === 45).length).toBe(4);
	});

	it('takes 30 lb off an EZ curl bar, not 45', () => {
		const load = describeLoading('ezbar', 80, HOME);
		expect(load).toMatchObject({ base: 30, sleeves: 2, perSleeve: 25 });
		expect(loadingLabel('ezbar', 80, HOME)).toBe('80 lb · 25 per side');
	});

	it('names the bar it is lighter than', () => {
		expect(loadingLabel('barbell', 41, HOME)).toBe('41 lb · lighter than the 45 lb bar');
		expect(loadingLabel('ezbar', 25, HOME)).toBe('25 lb · lighter than the 30 lb bar');
	});

	it('calls an empty bar an empty bar', () => {
		expect(loadingLabel('barbell', 45, HOME)).toBe('45 lb · bar only');
		expect(loadingLabel('ezbar', 30, HOME)).toBe('30 lb · bar only');
	});
});

describe('the plate-loaded machines', () => {
	it('starts a pulley at zero and splits across two sides', () => {
		const load = describeLoading('pulley', 90, HOME);
		expect(load).toMatchObject({ base: 0, sleeves: 2, perSleeve: 45 });
		expect(loadingLabel('pulley', 90, HOME)).toBe('90 lb · 45 per side');
	});

	it('starts a machine at zero and loads a single bar', () => {
		const load = describeLoading('machine', 90, HOME);
		expect(load).toMatchObject({ base: 0, sleeves: 1, perSleeve: 90 });
		expect(loadingLabel('machine', 90, HOME)).toBe('90 lb · 45 + 45 on the end');
	});

	it('says unloaded rather than "bar only" when there is no bar', () => {
		expect(loadingLabel('pulley', 0, HOME)).toBe('0 lb · unloaded');
	});
});

describe('the tools with nothing to load', () => {
	it('treats dumbbells as fixed weights', () => {
		expect(describeLoading('dumbbell', 40, HOME)).toEqual({
			kind: 'fixed',
			tool: 'dumbbell',
			weight: 40
		});
		expect(loadingLabel('dumbbell', 40, HOME)).toBe('40 lb each hand');
	});

	it('counts a pair of dumbbells twice toward volume, and nothing else twice', () => {
		expect(TOOL_SPEC.dumbbell.multiplier).toBe(2);
		expect(TOOL_SPEC.landmine.multiplier).toBe(1);
		expect(TOOL_SPEC.bodyweight.multiplier).toBe(1);
	});

	it('reads the weight field as added load for bodyweight work', () => {
		expect(loadingLabel('bodyweight', 0, HOME)).toBe('Bodyweight');
		expect(loadingLabel('bodyweight', 25, HOME)).toBe('Bodyweight + 25 lb');
	});

	it('never reports an unloadable weight for a tool with no plates', () => {
		expect(isUnloadable('dumbbell', 37.5, HOME)).toBe(false);
		expect(isUnloadable('bodyweight', 13, HOME)).toBe(false);
	});
});

describe('a home gym runs out', () => {
	it('will not ask for a fourth 45 a side when only six exist', () => {
		const load = describeLoading('barbell', 405, HOME);
		if (load.kind !== 'loaded') throw new Error('unreachable');
		expect(load.plates.filter((p) => p === 45).length).toBeLessThanOrEqual(3);
	});

	it('never exceeds any per-sleeve allowance, at any weight', () => {
		const allowance = new Map(
			perSideStock(HOME.inventory, TOOL_SPEC.barbell.sleeves).map((s) => [s.weight, s.count])
		);
		for (let weight = 45; weight <= 600; weight += 2.5) {
			const load = describeLoading('barbell', weight, HOME);
			if (load.kind !== 'loaded') throw new Error('unreachable');
			const used = new Map<number, number>();
			for (const p of load.plates) used.set(p, (used.get(p) ?? 0) + 1);
			for (const [plate, n] of used) {
				expect(n).toBeLessThanOrEqual(allowance.get(plate) ?? 0);
			}
		}
	});

	it('makes a load with micro plates that the standard set could not', () => {
		// 117.5 is 36.25 a side, 1.25 short without micro plates.
		expect(loadingLabel('barbell', 117.5, HOME)).toBe('117.5 lb · 35 + 1 + 0.25 per side');
		expect(isUnloadable('barbell', 117.5, HOME)).toBe(false);
		expect(isUnloadable('barbell', 117.5, RACK)).toBe(true);
	});
});

describe('describeStock', () => {
	it('summarises the rack', () => {
		expect(describeStock([plate(2.5, 4), plate(45, 6)])).toBe('45×6, 2.5×4');
	});

	it('says so when the rack is empty', () => {
		expect(describeStock([])).toBe('nothing yet');
	});
});

describe('plate colours', () => {
	it('defaults to plain iron when none is given', () => {
		expect(normalizeStock([{ weight: 45, count: 2 }])).toEqual([
			{ weight: 45, count: 2, color: DEFAULT_PLATE_COLOR }
		]);
	});

	it('keeps a colour that was chosen', () => {
		expect(normalizeStock([{ weight: 1, count: 4, color: '#c0392b' }])[0].color).toBe('#c0392b');
	});

	it('accepts shorthand hex and normalises it', () => {
		expect(normalizeStock([{ weight: 1, count: 4, color: '#F00' }])[0].color).toBe('#ff0000');
		expect(normalizeStock([{ weight: 1, count: 4, color: '  #C0392B ' }])[0].color).toBe('#c0392b');
	});

	it('refuses anything that is not a hex colour', () => {
		// This value is written straight into an SVG fill, so "red" and
		// "url(#x)" alike fall back to iron rather than reaching the DOM.
		for (const bad of ['red', 'url(#evil)', 'rgb(1,2,3)', '#12', '', 42, null]) {
			expect(normalizeStock([{ weight: 1, count: 4, color: bad }])[0].color).toBe(
				DEFAULT_PLATE_COLOR
			);
		}
	});

	it('exposes a weight-to-colour map for the diagrams', () => {
		const colors = plateColors([plate(45, 2), plate(1, 4, '#c0392b')]);
		expect(colors.get(45)).toBe(DEFAULT_PLATE_COLOR);
		expect(colors.get(1)).toBe('#c0392b');
		expect(colors.get(999)).toBeUndefined();
	});

	it('keeps the first colour when a denomination is listed twice', () => {
		const merged = normalizeStock([plate(5, 2, '#00ff00'), plate(5, 2, '#0000ff')]);
		expect(merged).toEqual([{ weight: 5, count: 4, color: '#00ff00' }]);
	});
});
