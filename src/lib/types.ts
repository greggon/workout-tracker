/**
 * Shared vocabulary. Lives outside `$lib/server` because the UI needs these
 * types too, and SvelteKit refuses to let client code import from the server
 * tree — even for types.
 */

/**
 * How a movement is loaded. This is the real equipment list, which differs from
 * the design's assumptions in most cases: its "machine" was a 45 lb stack and
 * its "pulley" was a selectorised pin, when both are plate-loaded here.
 */
export const TOOLS = [
	'barbell',
	'landmine',
	'ezbar',
	'dumbbell',
	'pulley',
	'machine',
	'bodyweight'
] as const;
export type Tool = (typeof TOOLS)[number];

/** Where an implement's empty weight comes from. */
export type BaseWeight = 'bar' | 'ezbar' | 'none';

export type ToolSpec = {
	label: string;
	/**
	 * Sleeves loaded at the same time, which is what turns an owned plate count
	 * into a per-sleeve allowance. Zero means nothing is loaded by hand.
	 */
	sleeves: number;
	base: BaseWeight;
	/** Implements moved at once — a pair of dumbbells is two. */
	multiplier: number;
	/** True when the weight field records *added* load rather than the total. */
	added: boolean;
	hint: string;
};

export const TOOL_SPEC: Record<Tool, ToolSpec> = {
	barbell: {
		label: 'Barbell',
		sleeves: 2,
		base: 'bar',
		multiplier: 1,
		added: false,
		hint: 'Bar plus plates on both sleeves.'
	},
	landmine: {
		label: 'Landmine',
		sleeves: 1,
		/*
		 * No base, despite there being a bar in your hands.
		 *
		 * One end of a landmine bar sits in a sleeve on the floor, so the bar's
		 * own 45 lb is carried by the pivot, not by you — and what little reaches
		 * the handle depends on the angle, which changes through the rep. Adding
		 * a flat 45 would describe a lift nobody is doing: a 41 lb row would read
		 * as "lighter than the bar" and prescribe no plates at all.
		 *
		 * So the number on a landmine movement is the iron you hang on the end,
		 * which is also the number you can actually check at the rack.
		 */
		base: 'none',
		multiplier: 1,
		added: false,
		// One sleeve means the whole pile is available to it, not half.
		hint: 'Plates on one end only. The bar pivots on the floor, so it is not counted.'
	},
	ezbar: {
		label: 'EZ curl bar',
		sleeves: 2,
		base: 'ezbar',
		multiplier: 1,
		added: false,
		hint: 'EZ bar plus plates on both sleeves.'
	},
	dumbbell: {
		label: 'Dumbbell',
		sleeves: 0,
		base: 'none',
		multiplier: 2,
		added: false,
		hint: 'Fixed dumbbells — the number is what you pick up, per hand.'
	},
	pulley: {
		label: 'Pulley',
		sleeves: 2,
		base: 'none',
		multiplier: 1,
		added: false,
		hint: 'Plate loaded on both sides. No pin, no stack.'
	},
	machine: {
		label: 'Machine',
		sleeves: 1,
		base: 'none',
		multiplier: 1,
		added: false,
		hint: 'Plate loaded on a single bar.'
	},
	bodyweight: {
		label: 'Bodyweight',
		sleeves: 0,
		base: 'none',
		multiplier: 1,
		added: true,
		hint: 'Pull-ups, dips, sit-ups. Enter any weight you add, or leave it at zero.'
	}
};

export const TOOL_LABELS: Record<Tool, string> = Object.fromEntries(
	TOOLS.map((t) => [t, TOOL_SPEC[t].label])
) as Record<Tool, string>;

/** True when the tool takes plates the lifter has to find and hang. */
export function isPlateLoaded(tool: Tool): boolean {
	return TOOL_SPEC[tool].sleeves > 0;
}

/** Day letters in rotation order. The split is 2–5 days, so A–E. */
export const DAY_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const MIN_SPLIT = 2;
export const MAX_SPLIT = 5;

/**
 * A denomination, how many of that plate you own — the whole pile, not a
 * per-side figure — and what colour it is.
 *
 * The colour is not decoration. At the rack you recognise a plate by its look
 * before you read the number stamped on it, so a diagram drawn in your actual
 * plate colours is quicker to act on than an accurate but uniform one.
 */
export type PlateStock = { weight: number; count: number; color: string };

/** Plain iron. What a plate is unless you say otherwise. */
export const DEFAULT_PLATE_COLOR = '#000000';

/**
 * Normalises a colour to `#rrggbb`, or returns null if it is not one.
 *
 * Deliberately strict: this value is written straight into an SVG `fill`, and
 * anything that is not a plain hex colour has no business being there.
 */
export function parseHexColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const hex = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
	// #abc is the same colour as #aabbcc.
	if (/^#[0-9a-f]{3}$/.test(hex)) {
		return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
	}
	return null;
}

/**
 * The gym everyone using this app actually trains in. A default is a guess, and
 * the useful guess here is the one rack these accounts share — not a
 * hypothetical commercial one, which would confidently prescribe plates that do
 * not exist in the building.
 *
 * Anyone whose gym differs sets their own in /settings; this is only what an
 * account starts with.
 */
export const DEFAULT_PLATE_STOCK: PlateStock[] = [
	{ weight: 45, count: 6, color: DEFAULT_PLATE_COLOR },
	{ weight: 35, count: 2, color: DEFAULT_PLATE_COLOR },
	{ weight: 25, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 10, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 5, count: 3, color: DEFAULT_PLATE_COLOR },
	{ weight: 2.5, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 1, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 0.75, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 0.5, count: 4, color: DEFAULT_PLATE_COLOR },
	{ weight: 0.25, count: 4, color: DEFAULT_PLATE_COLOR }
];
