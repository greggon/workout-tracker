import { describe, expect, it } from 'vitest';
import { MAX_GLYPH_HEIGHT, PARTIAL_MAX, plateGlyph } from './plate-glyph';

/** The denominations that actually hang on a bar, lightest first. */
const REAL = [2.5, 5, 10, 25, 35, 45];
const PARTIALS = [0.25, 0.5, 0.75, 1];

describe('partials', () => {
	it('are all the same size, because colour is what separates them', () => {
		const sizes = PARTIALS.map(plateGlyph);
		for (const size of sizes) expect(size).toEqual(sizes[0]);
	});

	it('are slim', () => {
		expect(plateGlyph(1).w).toBeLessThan(plateGlyph(2.5).w);
	});

	it('stop at a pound', () => {
		expect(PARTIAL_MAX).toBe(1);
		expect(plateGlyph(1)).toEqual(plateGlyph(0.25));
		expect(plateGlyph(1.5)).not.toEqual(plateGlyph(1));
	});
});

describe('real plates', () => {
	it('grow in both directions, never sideways only', () => {
		for (let i = 1; i < REAL.length; i++) {
			const lighter = plateGlyph(REAL[i - 1]);
			const heavier = plateGlyph(REAL[i]);
			expect(heavier.h).toBeGreaterThan(lighter.h);
			expect(heavier.w).toBeGreaterThan(lighter.w);
		}
	});

	it('are distinguishable at a glance from their neighbour', () => {
		// The old linear scale put a 1 and a 2.5 seven percent apart in height
		// and identical in width, which is why this test exists. Twelve percent
		// is the floor for telling two plates apart across a rack.
		for (let i = 1; i < REAL.length; i++) {
			const lighter = plateGlyph(REAL[i - 1]);
			const heavier = plateGlyph(REAL[i]);
			const growth = (heavier.h - lighter.h) / lighter.h;
			expect(growth, `${REAL[i - 1]} lb vs ${REAL[i]} lb`).toBeGreaterThan(0.12);
		}
	});

	it('separates the lightest real plate clearly from a partial', () => {
		const partial = plateGlyph(1);
		const smallest = plateGlyph(2.5);
		expect((smallest.h - partial.h) / partial.h).toBeGreaterThan(0.3);
		expect(smallest.w).toBeGreaterThan(partial.w);
	});

	it('tells a 2.5 from a 5', () => {
		expect(plateGlyph(5).h).toBeGreaterThan(plateGlyph(2.5).h * 1.2);
	});
});

describe('the canvas', () => {
	it('is sized for the tallest plate', () => {
		for (const lb of [...PARTIALS, ...REAL]) {
			expect(plateGlyph(lb).h).toBeLessThanOrEqual(MAX_GLYPH_HEIGHT);
		}
	});

	it('does not grow past the heaviest anchor', () => {
		// A 100 lb plate does not exist, but a typo should not draw off-canvas.
		expect(plateGlyph(100)).toEqual(plateGlyph(45));
		expect(plateGlyph(1000).h).toBe(MAX_GLYPH_HEIGHT);
	});
});

describe('denominations off the standard scale', () => {
	it('interpolates, staying between its neighbours', () => {
		// 20 kg plates, and the odd 7.5, should land sensibly rather than
		// snapping to a size that misrepresents them.
		for (const [lb, lower, upper] of [
			[7.5, 5, 10],
			[20, 10, 25],
			[44, 35, 45]
		] as const) {
			const glyph = plateGlyph(lb);
			expect(glyph.h).toBeGreaterThan(plateGlyph(lower).h);
			expect(glyph.h).toBeLessThan(plateGlyph(upper).h);
		}
	});

	it('never returns a nonsense size', () => {
		for (const bad of [NaN, Infinity, -5, 0]) {
			const glyph = plateGlyph(bad);
			expect(Number.isFinite(glyph.h)).toBe(true);
			expect(glyph.h).toBeGreaterThan(0);
			expect(glyph.w).toBeGreaterThan(0);
		}
	});
});
