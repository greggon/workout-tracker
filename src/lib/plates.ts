import { DEFAULT_PLATE_COLOR, parseHexColor, TOOL_SPEC, type PlateStock, type Tool } from './types';

/**
 * How a prescribed weight is actually loaded on the equipment you own.
 *
 * Two things the design did not model: which denominations you have, and how
 * many. A home gym runs out — six 45s is three a side, and a fill that assumes
 * an unlimited rack will cheerfully ask for a fourth.
 */

/** Floating point guard: 137.5 lb a side must not miss a 2.5 by 1e-13. */
const EPSILON = 0.001;

/**
 * Rows stored before counts existed were bare numbers meaning "a commercial
 * rack, effectively unlimited". Ten keeps them behaving as they used to.
 */
const LEGACY_COUNT = 10;

/** Largest DP table we will build; past it the fill degrades to greedy. */
const MAX_UNITS = 50_000;

export type LoadingConfig = {
	/** Weight of the empty barbell. */
	barWeight: number;
	/** Weight of the empty EZ curl bar. */
	ezBarWeight: number;
	/** Everything in the rack, with quantities. */
	inventory: PlateStock[];
};

/** The empty implement's weight, before any plates. */
function baseWeight(tool: Tool, config: LoadingConfig): number {
	switch (TOOL_SPEC[tool].base) {
		case 'bar':
			return config.barWeight;
		case 'ezbar':
			return config.ezBarWeight;
		case 'none':
			return 0;
	}
}

export type PlateFill = {
	/** Plates for one side, heaviest first. */
	plates: number[];
	/** Weight per side the inventory could not make. Zero when exact. */
	remainder: number;
};

/**
 * Cleans a stored inventory: merges duplicate denominations, drops junk, sorts
 * heaviest first. Accepts the legacy `number[]` shape so an account saved
 * before counts existed still loads.
 */
export function normalizeStock(raw: unknown): PlateStock[] {
	const merged = new Map<number, { count: number; color: string }>();

	for (const item of Array.isArray(raw) ? raw : []) {
		let weight: number;
		let count: number;
		let color = DEFAULT_PLATE_COLOR;

		if (typeof item === 'number') {
			weight = item;
			count = LEGACY_COUNT;
		} else if (item && typeof item === 'object') {
			const row = item as Partial<PlateStock>;
			weight = Number(row.weight);
			count = Math.floor(Number(row.count));
			// Inventories saved before colors existed simply have none.
			color = parseHexColor(row.color) ?? DEFAULT_PLATE_COLOR;
		} else {
			continue;
		}

		if (!Number.isFinite(weight) || weight <= 0) continue;
		if (!Number.isFinite(count) || count <= 0) continue;

		const existing = merged.get(weight);
		// Merging duplicates keeps the first color seen rather than the last,
		// so the top entry in the settings table is the one that wins.
		merged.set(weight, {
			count: (existing?.count ?? 0) + count,
			color: existing?.color ?? color
		});
	}

	return [...merged]
		.map(([weight, { count, color }]) => ({ weight, count, color }))
		.sort((a, b) => b.weight - a.weight);
}

/** Denomination → color, for drawing a fill that has already been chosen. */
export function plateColors(inventory: PlateStock[]): Map<number, string> {
	return new Map(normalizeStock(inventory).map((s) => [s.weight, s.color]));
}

/**
 * What one sleeve may draw on. A barbell loads two at once, so six 45s is three
 * a side. A landmine or a machine loads one, so the same six 45s are all
 * available to it.
 */
export function perSideStock(inventory: PlateStock[], sleeves: number): PlateStock[] {
	if (sleeves <= 0) return [];
	return normalizeStock(inventory)
		.map(({ weight, count, color }) => ({ weight, color, count: Math.floor(count / sleeves) }))
		.filter((s) => s.count > 0);
}

function gcd(a: number, b: number): number {
	while (b) [a, b] = [b, a % b];
	return a;
}

/** Heaviest-first, count-respecting. Only used past the DP ceiling. */
function greedyFill(perSide: number, stock: PlateStock[]): PlateFill {
	const plates: number[] = [];
	let remaining = perSide;
	for (const { weight, count } of stock) {
		let left = count;
		while (left > 0 && remaining >= weight - EPSILON) {
			plates.push(weight);
			remaining -= weight;
			left--;
		}
	}
	return { plates, remainder: remaining < EPSILON ? 0 : remaining };
}

/**
 * The fewest plates that load one side, getting as close to the target as the
 * plates on hand allow.
 *
 * Not greedy. Greedy is only minimal when each denomination divides the ones
 * above it, and a real rack does not: the 35 breaks it. At 60 lb a side greedy
 * loads 45 + 10 + 5 where 35 + 25 does it in two. Worse, on a sparse set it
 * reports loadable weights as impossible — asked for 30 a side from 45/25/10 it
 * takes the 25, finds nothing for the last 5, and gives up, when 10 + 10 + 10
 * makes it exactly.
 *
 * So: a bounded knapsack, minimizing plate count over the largest achievable
 * weight at or below the target. Dividing through by the gcd keeps the table
 * small — a standard rack reduces to 2.5 lb units, 90 lb a side being 36.
 *
 * `available` is a per-side allowance, already divided by the sleeve count.
 */
export function fillPlates(perSide: number, available: PlateStock[]): PlateFill {
	const stock = normalizeStock(available);
	if (perSide <= EPSILON || stock.length === 0) {
		return { plates: [], remainder: Math.max(0, perSide) };
	}

	const step = stock.map((s) => Math.round(s.weight * 100)).reduce(gcd);
	const units = stock.map((s) => Math.round(s.weight * 100) / step);
	const target = Math.floor(Math.round(perSide * 100) / step);

	if (target <= 0) return { plates: [], remainder: perSide };
	if (target > MAX_UNITS) return greedyFill(perSide, stock);

	const UNREACHABLE = 0x7fffffff;
	let best = new Int32Array(target + 1).fill(UNREACHABLE);
	best[0] = 0;

	// One layer per denomination, recording how many of it each sum used, so
	// the chosen plates can be walked back out at the end.
	const taken: Int32Array[] = [];

	for (let i = 0; i < stock.length; i++) {
		const unit = units[i];
		const limit = stock[i].count;
		const previous = best;
		const next = new Int32Array(target + 1).fill(UNREACHABLE);
		const layer = new Int32Array(target + 1);

		for (let sum = 0; sum <= target; sum++) {
			let fewest = previous[sum];
			let used = 0;
			for (let k = 1; k <= limit && k * unit <= sum; k++) {
				const without = previous[sum - k * unit];
				// <= rather than <: among equal-length fills, take more of this
				// denomination. Layers run heaviest first, so ties resolve toward
				// fewer, heavier plates on the sleeve.
				if (without !== UNREACHABLE && without + k <= fewest) {
					fewest = without + k;
					used = k;
				}
			}
			next[sum] = fewest;
			layer[sum] = used;
		}

		best = next;
		taken.push(layer);
	}

	let reached = target;
	while (reached > 0 && best[reached] === UNREACHABLE) reached--;

	const plates: number[] = [];
	let sum = reached;
	for (let i = stock.length - 1; i >= 0; i--) {
		const k = taken[i][sum];
		for (let n = 0; n < k; n++) plates.push(stock[i].weight);
		sum -= k * units[i];
	}
	plates.sort((a, b) => b - a);

	const remainder = (Math.round(perSide * 100) - reached * step) / 100;
	return { plates, remainder: remainder < EPSILON ? 0 : remainder };
}

export type Loading =
	| {
			kind: 'loaded';
			tool: Tool;
			/** Sleeves being loaded: 2 for a bar, 1 for a landmine or machine. */
			sleeves: number;
			/** Weight of the empty implement. */
			base: number;
			/** Plates wanted on each loaded sleeve. */
			perSleeve: number;
			plates: number[];
			remainder: number;
			/** The target is at or below the empty implement. */
			bareOnly: boolean;
			/** The target is below the empty implement, so nothing describes it. */
			belowBase: boolean;
	  }
	| { kind: 'fixed'; tool: Tool; weight: number }
	| { kind: 'bodyweight'; added: number };

export function describeLoading(tool: Tool, weight: number, config: LoadingConfig): Loading {
	const spec = TOOL_SPEC[tool];

	if (tool === 'bodyweight') return { kind: 'bodyweight', added: Math.max(0, weight) };
	// Fixed dumbbells: the number is what you pick up, so there is nothing to load.
	if (spec.sleeves === 0) return { kind: 'fixed', tool, weight };

	const base = baseWeight(tool, config);
	const overBase = weight - base;

	if (overBase < -EPSILON) {
		return {
			kind: 'loaded',
			tool,
			sleeves: spec.sleeves,
			base,
			perSleeve: 0,
			plates: [],
			remainder: 0,
			bareOnly: true,
			belowBase: true
		};
	}

	const perSleeve = Math.max(0, overBase / spec.sleeves);
	const fill = fillPlates(perSleeve, perSideStock(config.inventory, spec.sleeves));

	return {
		kind: 'loaded',
		tool,
		sleeves: spec.sleeves,
		base,
		perSleeve,
		bareOnly: fill.plates.length === 0 && fill.remainder <= EPSILON,
		belowBase: false,
		...fill
	};
}

/**
 * Weights print whole when they are whole. Two decimals otherwise, because
 * shortfalls land on quarters — rounding 1.25 to "1.3" would misreport by
 * exactly the amount the reader is trying to make up.
 */
function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Compact summary for settings: "45×6, 35×2, 25×4". */
export function describeStock(inventory: PlateStock[]): string {
	const stock = normalizeStock(inventory);
	if (stock.length === 0) return 'nothing yet';
	return stock.map((s) => `${fmt(s.weight)}×${s.count}`).join(', ');
}

/**
 * The one-line setup instruction under each movement — what to actually do at
 * the rack.
 */
export function loadingLabel(tool: Tool, weight: number, config: LoadingConfig): string {
	const loading = describeLoading(tool, weight, config);

	if (loading.kind === 'bodyweight') {
		return loading.added > 0 ? `Bodyweight + ${fmt(loading.added)} lb` : 'Bodyweight';
	}

	if (loading.kind === 'fixed') {
		return `${fmt(loading.weight)} lb each hand`;
	}

	const { base, sleeves, plates, remainder, perSleeve } = loading;
	// One sleeve loads "on the end"; two load "per side".
	const where = sleeves === 1 ? 'on the end' : 'per side';
	const bare = TOOL_SPEC[tool].base === 'none' ? 'unloaded' : 'bar only';

	if (loading.belowBase) return `${fmt(weight)} lb · lighter than the ${fmt(base)} lb bar`;
	if (loading.bareOnly) return `${fmt(weight)} lb · ${bare}`;
	if (plates.length === 0) {
		return `${fmt(weight)} lb · ${fmt(perSleeve)} lb ${where}, nothing light enough`;
	}

	const short = remainder > 0 ? ` · ${fmt(remainder)} lb short` : '';
	return `${fmt(weight)} lb · ${plates.map(fmt).join(' + ')} ${where}${short}`;
}

/** True when the plates on hand cannot make the prescribed weight exactly. */
export function isUnloadable(tool: Tool, weight: number, config: LoadingConfig): boolean {
	const loading = describeLoading(tool, weight, config);
	return loading.kind === 'loaded' && loading.remainder > EPSILON;
}
