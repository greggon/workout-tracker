import { describe, expect, it } from 'vitest';
import {
	inkOn,
	MAX_GLYPH_HEIGHT,
	PARTIAL_MAX,
	plateGlyph,
	plateLabel,
	plateText
} from './plate-glyph';

/** The denominations that actually hang on a bar, lightest first. */
const REAL = [2.5, 5, 10, 25, 35, 45];
const PARTIALS = [0.25, 0.5, 0.75, 1];

describe('partials', () => {
	it('are all the same size, because color is what separates them', () => {
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

describe('the number written on a plate', () => {
	const on = (lb: number) => plateText(lb, plateGlyph(lb));

	it('writes a whole number across the plate', () => {
		expect(on(45).lines).toEqual(['45']);
		expect(on(25).lines).toEqual(['25']);
		expect(on(10).lines).toEqual(['10']);
	});

	it('stacks a number that will not fit across it', () => {
		// 2.5 is three characters on something 22 units wide; down the plate is
		// the only way it fits, and is how a real rack reads anyway.
		expect(on(2.5).lines).toEqual(['2', '.', '5']);
		expect(on(0.25).lines).toEqual(['0', '.', '2', '5']);
	});

	it('never writes a number wider than the plate it is on', () => {
		for (const lb of [0.25, 0.5, 0.75, 1, 2.5, 5, 10, 25, 35, 45]) {
			const glyph = plateGlyph(lb);
			const { lines, fontSize, lineHeight } = plateText(lb, glyph);
			const widest = Math.max(...lines.map((l) => l.length)) * 0.58 * fontSize;
			expect(widest, `${lb} lb across`).toBeLessThanOrEqual(glyph.w);
			expect(lines.length * lineHeight, `${lb} lb down`).toBeLessThanOrEqual(glyph.h);
		}
	});

	it('scales the number to the plate', () => {
		expect(on(45).fontSize).toBeGreaterThan(on(1).fontSize);
	});

	it('writes the weight the way it is spoken', () => {
		expect(plateLabel(45)).toBe('45');
		expect(plateLabel(2.5)).toBe('2.5');
		expect(plateLabel(0.75)).toBe('0.75');
	});
});

describe('ink on a plate', () => {
	it('goes white on dark iron and black on bright', () => {
		// The default plate is black, and most of a rack is too.
		expect(inkOn('#000000')).toBe('#ffffff');
		expect(inkOn('#c0392b')).toBe('#ffffff');
		expect(inkOn('#0000ff')).toBe('#ffffff');
		// Greg's yellow 25s and olive 35s.
		expect(inkOn('#ffff00')).toBe('#12131a');
		expect(inkOn('#ffffff')).toBe('#12131a');
	});

	it('falls back to something readable for a color it cannot parse', () => {
		expect(inkOn('nonsense')).toBe('#ffffff');
	});
});
