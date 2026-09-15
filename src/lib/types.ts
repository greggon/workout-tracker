/**
 * Shared vocabulary. Lives outside `$lib/server` because the UI needs these
 * types too, and SvelteKit refuses to let client code import from the server
 * tree — even for types.
 */

/** How a movement is loaded. Drives both the plate diagram and volume math. */
export const TOOLS = ['barbell', 'dumbbell', 'machine', 'pulley'] as const;
export type Tool = (typeof TOOLS)[number];

export const TOOL_LABELS: Record<Tool, string> = {
	barbell: 'Barbell',
	dumbbell: 'Dumbbell',
	machine: 'Machine',
	pulley: 'Pulley'
};

/** Day letters in rotation order. The split is 2–5 days, so A–E. */
export const DAY_KEYS = ['A', 'B', 'C', 'D', 'E'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const MIN_SPLIT = 2;
export const MAX_SPLIT = 5;
