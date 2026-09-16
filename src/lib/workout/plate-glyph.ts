/**
 * How big to draw a plate.
 *
 * Not a formula. A linear height made a 1 lb and a 2.5 differ by seven percent
 * and nothing at all in width, which is useless at arm's length — the whole
 * point of the drawing is that you recognize the stack before you read it.
 *
 * So the scale is stepped, anchored on the denominations that actually exist,
 * and interpolated in between for anything unusual.
 */

/** At or below this a plate is a partial: slim, and told apart by color. */
export const PARTIAL_MAX = 1;

/** Every partial is the same size, by design. Color is what separates them. */
const PARTIAL: Glyph = { h: 42, w: 18 };

export type Glyph = { h: number; w: number };

/**
 * weight, height, thickness — the anchors the scale is built on.
 *
 * The heights keep the proportions they always had; the widths are set by a
 * different constraint, which is that every plate now carries its own number.
 * Even the slimmest has to be wide enough to read a digit off.
 */
const SCALE: readonly (readonly [number, number, number])[] = [
	[1, 42, 18],
	[2.5, 62, 22],
	[5, 81, 24],
	[10, 99, 26],
	[25, 114, 29],
	[35, 133, 31],
	[45, 151, 34]
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

/** How a plate's weight is written on it: 45, 2.5, 0.25. */
export function plateLabel(weight: number): string {
	if (!Number.isFinite(weight)) return '';
	return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

export type PlateText = {
	/** One entry per rendered line: either the whole label, or a digit each. */
	lines: string[];
	fontSize: number;
	lineHeight: number;
};

/** Digits are about this wide relative to the font size; a point, much less. */
const DIGIT_EM = 0.58;
const POINT_EM = 0.3;

function textWidth(label: string, fontSize: number): number {
	let em = 0;
	for (const ch of label) em += ch === '.' ? POINT_EM : DIGIT_EM;
	return em * fontSize;
}

/**
 * The weight, written on the plate.
 *
 * A number that does not fit across a plate is stacked down it instead, one
 * character per line — which is what a real rack looks like anyway, and is the
 * only way "2.5" fits on something 22 units wide. Sized to the plate rather
 * than fixed, so a 45 reads from further away than a quarter-pounder.
 */
export function plateText(weight: number, glyph: Glyph): PlateText {
	const label = plateLabel(weight);
	// A larger share of the plate than looks necessary on paper: the drawing is
	// rendered at about 150px, so this number is a third of the size on screen
	// that it is here.
	const fontSize = Math.min(17, Math.max(11, glyph.w * 0.56));
	const lineHeight = fontSize * 0.92;

	// Padding on both sides, so a number never touches the plate's edge.
	if (textWidth(label, fontSize) <= glyph.w - 6) {
		return { lines: [label], fontSize, lineHeight };
	}
	return { lines: [...label], fontSize, lineHeight };
}

/**
 * Black or white, whichever can be read on this plate.
 *
 * Plate colors are whatever the lifter picked, and the default is black iron —
 * so the number on top of them cannot be a fixed color. Rec. 709 luminance,
 * with the threshold where the two are equally legible.
 */
export function inkOn(fill: string): string {
	const hex = fill.replace('#', '');
	if (hex.length !== 6) return '#ffffff';
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance > 0.55 ? '#12131a' : '#ffffff';
}
