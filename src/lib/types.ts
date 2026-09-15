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
		base: 'bar',
		multiplier: 1,
		added: false,
		// One sleeve means the whole pile is available to it, not half.
		hint: 'Bar plus plates on one end only.'
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
 * A denomination and how many of that plate you own — the whole pile, not a
 * per-side figure. A home gym runs out, and a fill that assumes otherwise sends
 * you looking for a fourth 35 you do not have.
 */
export type PlateStock = { weight: number; count: number };

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
	{ weight: 45, count: 6 },
	{ weight: 35, count: 2 },
	{ weight: 25, count: 4 },
	{ weight: 10, count: 4 },
	{ weight: 5, count: 3 },
	{ weight: 2.5, count: 4 },
	{ weight: 1, count: 4 },
	{ weight: 0.75, count: 4 },
	{ weight: 0.5, count: 4 },
	{ weight: 0.25, count: 4 }
];
