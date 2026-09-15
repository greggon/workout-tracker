/**
 * How big to draw a plate.
 *
 * Not a formula. A linear height made a 1 lb and a 2.5 differ by seven percent
 * and nothing at all in width, which is useless at arm's length — the whole
 * point of the drawing is that you recognise the stack before you read it.
 *
 * So the scale is stepped, anchored on the denominations that actually exist,
 * and interpolated in between for anything unusual.
 */

/** At or below this a plate is a partial: slim, and told apart by colour. */
export const PARTIAL_MAX = 1;

/** Every partial is the same size, by design. Colour is what separates them. */
const PARTIAL: Glyph = { h: 16, w: 3.5 };

export type Glyph = { h: number; w: number };

/** weight, height, thickness — the anchors the scale is built on. */
const SCALE: readonly (readonly [number, number, number])[] = [
	[1, 16, 3.5],
	[2.5, 24, 5.5],
	[5, 31, 6.5],
	[10, 38, 7.5],
	[25, 44, 8.5],
	[35, 51, 9.5],
	[45, 58, 11]
];

/** The tallest plate, so the canvas can be sized to hold it. */
export const MAX_GLYPH_HEIGHT = SCALE[SCALE.length - 1][1];

export function plateGlyph(weight: number): Glyph {
	if (!Number.isFinite(weight) || weight <= PARTIAL_MAX) return { ...PARTIAL };

	const last = SCALE[SCALE.length - 1];
	// Anything heavier than the heaviest anchor draws as that anchor rather
	// than growing off the canvas.
	if (weight >= last[0]) return { h: last[1], w: last[2] };

	for (let i = 1; i < SCALE.length; i++) {
		const [hiLb, hiH, hiW] = SCALE[i];
		if (weight > hiLb) continue;
		const [loLb, loH, loW] = SCALE[i - 1];
		const t = (weight - loLb) / (hiLb - loLb);
		return { h: loH + (hiH - loH) * t, w: loW + (hiW - loW) * t };
	}

	return { h: last[1], w: last[2] };
}
