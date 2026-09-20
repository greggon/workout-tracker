import { TOOL_SPEC, type Tool } from './types';

/**
 * Volume and display maths, shared by the server (computing session totals)
 * and the client (planned volume as you edit a routine). Pure functions over
 * plain data, so both sides agree by construction rather than by review.
 */

/**
 * Dumbbell work moves one implement per hand, so a set at 40 lb moves 80.
 * Every other tool moves a single load.
 */
export function toolMultiplier(tool: Tool): number {
	return TOOL_SPEC[tool].multiplier;
}

/** One loaded implement within an exercise: the main movement or its pair. */
export type Loaded = { tool: Tool; weight: number };

export type PlannedExercise = {
	sets: number;
	reps: number;
	/** Main movement first, then the superset pair if there is one. */
	movements: Loaded[];
};

/** Weight moved by a single completed set. */
export function setVolume(movement: Loaded, reps: number): number {
	return movement.weight * toolMultiplier(movement.tool) * reps;
}

/**
 * True when a movement carries no external load — pull-ups, dips and sit-ups
 * with nothing hung off you.
 *
 * Its volume is honestly zero, since volume is weight moved and there is no
 * weight here the app knows about. But "0 lb" is a figure that says nothing
 * about a set of pull-ups, so anywhere a total is printed, the reps are what
 * such a movement has to show for itself instead.
 */
export function isUnloaded(movement: Loaded): boolean {
	return movement.weight * toolMultiplier(movement.tool) === 0;
}

/**
 * What a day is worth if every prescribed rep is completed. Both halves of a
 * superset count — the design's card meta reads "N exercises · N sets · N lb
 * planned", and the pair is real work.
 */
export function plannedVolume(exercises: PlannedExercise[]): number {
	return exercises.reduce(
		(total, ex) =>
			total + ex.movements.reduce((sum, m) => sum + setVolume(m, ex.reps) * ex.sets, 0),
		0
	);
}

/**
 * A routine day in the shape the volume maths wants: the pair, when there is
 * one, is just another loaded movement in the same exercise. Written once
 * because three callers were each unpacking `main` and `pair` themselves.
 */
export function plannedFrom(
	exercises: { sets: number; reps: number; main: Loaded; pair: Loaded | null }[]
): PlannedExercise[] {
	return exercises.map((ex) => ({
		sets: ex.sets,
		reps: ex.reps,
		movements: ex.pair ? [ex.main, ex.pair] : [ex.main]
	}));
}

/** Total prescribed sets, counting an exercise once however many movements it pairs. */
export function plannedSets(exercises: PlannedExercise[]): number {
	return exercises.reduce((total, ex) => total + ex.sets, 0);
}

/**
 * Movements in a day, counting both halves of a superset.
 *
 * A superset is one row in the routine but two lifts to do, and the count on a
 * day card is there to answer "how much is this day": three paired exercises is
 * six things to perform, and reading "3 exercises" undersells the day by half.
 * The row count is an implementation detail of how the routine is stored.
 */
export function plannedMovements(exercises: PlannedExercise[]): number {
	return exercises.reduce((total, ex) => total + ex.movements.length, 0);
}

/** Every logging slot in a day: sets × movements. Drives the progress bar. */
export function totalSlots(exercises: PlannedExercise[]): number {
	return exercises.reduce((total, ex) => total + ex.sets * ex.movements.length, 0);
}

/**
 * Weights print as integers when they are whole and to one decimal otherwise,
 * so a rack of 45s never reads "45.0" while 117.5 keeps its half.
 */
export function formatWeight(n: number): string {
	return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1);
}

/** Volume figures are large and only meaningful to the pound. */
export function formatVolume(n: number): string {
	return Math.round(n).toLocaleString('en-US');
}

/**
 * Rotation order: the day after the one most recently finished comes first.
 * With no history at all, the routine's own order stands.
 */
export function rotateFrom<T extends { key: string }>(days: T[], lastKey: string | null): T[] {
	if (!lastKey) return days;
	const i = days.findIndex((d) => d.key === lastKey);
	if (i < 0) return days;
	return [...days.slice(i + 1), ...days.slice(0, i + 1)];
}

const DAY_MS = 86_400_000;

/** "today" / "yesterday" / "12 days ago", matching the design's copy. */
export function relativeDay(when: Date | number, now: Date | number = Date.now()): string {
	const days = Math.round((Number(now) - Number(when)) / DAY_MS);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	return `${days} days ago`;
}

/**
 * Whole minutes, never zero — a workout that was logged took some time, and
 * "0 min" reads as a bug. Split out from `formatMinutes` so a tile that prints
 * its unit separately still rounds by the same rule.
 */
export function wholeMinutes(mins: number): number {
	return Math.max(1, Math.round(mins));
}

/** Whole minutes, for "52 min" style session lengths. */
export function formatMinutes(mins: number): string {
	return `${wholeMinutes(mins)} min`;
}
