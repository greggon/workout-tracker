/**
 * "That's 3 Cybertrucks!" — a finished workout's volume, restated in things.
 *
 * Add a line to EQUIVALENTS to add a thing. Weights are in pounds and only
 * need to be roughly right; the point is the picture, not the physics. Keep a
 * spread of sizes, small to huge, so every workout has a few that fit: a
 * light day needs things measured in hundreds of pounds, a big one things in
 * tens of thousands. Silly is encouraged.
 */
export type Equivalent = {
	name: string;
	plural: string;
	lb: number;
	emoji: string;
};

export const EQUIVALENTS: Equivalent[] = [
	{ name: 'one-pound meat container', plural: 'one-pound meat containers', lb: 1, emoji: '🥩' },
	{ name: 'rat', plural: 'rats', lb: 1, emoji: '🐀' },
	{ name: 'PlayStation 5', plural: 'PlayStation 5s', lb: 10, emoji: '🎮' },
	{ name: 'chainsaw', plural: 'chainsaws', lb: 12, emoji: '🪚' },
	{ name: 'golden retriever', plural: 'golden retrievers', lb: 70, emoji: '🐕' },
	{ name: 'toilet', plural: 'toilets', lb: 90, emoji: '🚽' },
	{ name: 'anvil', plural: 'anvils', lb: 150, emoji: '⚒️' },
	{ name: 'washing machine', plural: 'washing machines', lb: 170, emoji: '🧺' },
	{ name: 'tombstone', plural: 'tombstones', lb: 300, emoji: '🪦' },
	{ name: 'grizzly bear', plural: 'grizzly bears', lb: 600, emoji: '🐻' },
	{ name: 'vending machine', plural: 'vending machines', lb: 700, emoji: '🥤' },
	{ name: 'pool table', plural: 'pool tables', lb: 700, emoji: '🎱' },
	{ name: 'hot tub', plural: 'hot tubs', lb: 800, emoji: '🛁' },
	{ name: 'grand piano', plural: 'grand pianos', lb: 990, emoji: '🎹' },
	{ name: 'polar bear', plural: 'polar bears', lb: 1000, emoji: '🐻‍❄️' },
	{ name: 'whale testicle', plural: 'whale testicles', lb: 1100, emoji: '🐳' },
	{ name: 'horse', plural: 'horses', lb: 1100, emoji: '🐎' },
	{ name: 'dairy cow', plural: 'dairy cows', lb: 1500, emoji: '🐄' },
	{ name: 'Smart car', plural: 'Smart cars', lb: 1550, emoji: '🚗' },
	{ name: 'great white shark', plural: 'great white sharks', lb: 2400, emoji: '🦈' },
	{ name: 'giraffe', plural: 'giraffes', lb: 2600, emoji: '🦒' },
	{ name: 'hippo', plural: 'hippos', lb: 3300, emoji: '🦛' },
	{ name: 'rhino', plural: 'rhinos', lb: 5000, emoji: '🦏' },
	{ name: 'Cybertruck', plural: 'Cybertrucks', lb: 6660, emoji: '🛻' },
	{ name: 'orca', plural: 'orcas', lb: 8000, emoji: '🐋' },
	{ name: 'African elephant', plural: 'African elephants', lb: 13000, emoji: '🐘' },
	{ name: 'T. rex', plural: 'T. rexes', lb: 15000, emoji: '🦖' },
	{ name: 'school bus', plural: 'school buses', lb: 25000, emoji: '🚌' }
];

export type Pick = { item: Equivalent; count: number };

/**
 * A random thing from the table that the volume lifts at least one of.
 *
 * Any count goes: "18,000 rats" is as much the point as "2.5 school buses",
 * so small things are not passed over for heavier ones. Null when the volume
 * is below even the lightest thing — a bodyweight day logs no pounds, and
 * "0.2 rats" is not a celebration.
 *
 * `random` is injectable so tests can choose which fitting item comes out.
 */
export function pickEquivalent(
	volume: number,
	random: () => number = Math.random,
	table: Equivalent[] = EQUIVALENTS
): Pick | null {
	const pool = table.filter((item) => volume / item.lb >= 1);
	if (pool.length === 0) return null;
	const item = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
	return { item, count: volume / item.lb };
}

/**
 * The count as it should read: a tenth under ten ("2.5"), whole above it
 * ("37"), and never a trailing ".0".
 */
export function formatCount(count: number): string {
	if (count < 10) {
		const tenths = Math.floor(count * 10) / 10;
		return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
	}
	return Math.floor(count).toLocaleString('en-US');
}

/** "Cybertruck" or "Cybertrucks", by how the count reads. */
export function unitName(item: Equivalent, count: number): string {
	return formatCount(count) === '1' ? item.name : item.plural;
}

/** The whole line: "That's 3 Cybertrucks!" */
export function equivalentMessage({ item, count }: Pick): string {
	return `That's ${formatCount(count)} ${unitName(item, count)}!`;
}
