/**
 * Warm-up sets: lighter sets before an exercise's working sets, each with its
 * own weight and reps — 135 × 5, 185 × 3, 205 × 1 before 3 × 5 at 225.
 *
 * Optional, and set per exercise in the routine. They count toward volume and
 * progress like any other set, but an exercise is finished once its working
 * sets are, whether or not the warm-ups were logged.
 */
export type Warmup = { weight: number; reps: number };

export const MAX_WARMUPS = 8;
const MAX_WEIGHT = 10_000;
const MAX_REPS = 100;

/**
 * Validates warm-ups from an untrusted source (a form field, a stored row).
 * Anything malformed is an error rather than quietly dropped, so a typo in the
 * editor surfaces instead of vanishing on save.
 */
export function parseWarmups(raw: unknown): Warmup[] {
	if (raw === undefined || raw === null || raw === '') return [];
	const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
	if (!Array.isArray(value)) throw new Error('Warm-ups must be a list');
	if (value.length > MAX_WARMUPS) throw new Error(`At most ${MAX_WARMUPS} warm-up sets`);
	return value.map((w) => {
		const weight = Number(w?.weight);
		const reps = Number(w?.reps);
		if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT) {
			throw new Error('Each warm-up set needs a weight');
		}
		if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
			throw new Error('Each warm-up set needs at least one rep');
		}
		return { weight, reps };
	});
}

/**
 * A standard ramp up to the working weight: about half for 5, seven-tenths for
 * 3, and most of the way for a single. Weights round down to 5 lb — what two
 * 2.5s on a bar can make — never go below `floor` (an empty bar), and a step
 * that would repeat the one before it, or reach the working weight, is left
 * out. A light working weight may get only one or two warm-ups, or none.
 */
export function suggestWarmups(working: number, floor = 0): Warmup[] {
	const steps: [number, number][] = [
		[0.5, 5],
		[0.7, 3],
		[0.85, 1]
	];
	const out: Warmup[] = [];
	for (const [share, reps] of steps) {
		const weight = Math.max(floor, Math.floor((working * share) / 5) * 5);
		if (weight >= working) continue;
		if (out.length && weight <= out[out.length - 1].weight) continue;
		out.push({ weight, reps });
	}
	return out;
}
