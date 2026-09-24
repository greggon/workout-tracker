import { describe, expect, it } from 'vitest';
import {
	EQUIVALENTS,
	equivalentMessage,
	formatCount,
	pickEquivalent,
	type Equivalent
} from './equivalents';

const cybertruck: Equivalent = {
	name: 'Cybertruck',
	plural: 'Cybertrucks',
	lb: 6660,
	emoji: '🛻'
};
const dog: Equivalent = { name: 'dog', plural: 'dogs', lb: 70, emoji: '🐕' };
const bus: Equivalent = { name: 'bus', plural: 'buses', lb: 25000, emoji: '🚌' };

describe('the equivalents table', () => {
	it('has a sensible weight and both names for every entry', () => {
		for (const item of EQUIVALENTS) {
			expect(item.lb).toBeGreaterThan(0);
			expect(item.name.length).toBeGreaterThan(0);
			expect(item.plural.length).toBeGreaterThan(0);
		}
	});

	it('includes the Cybertruck at 6,660 lb', () => {
		expect(EQUIVALENTS.find((e) => e.name === 'Cybertruck')?.lb).toBe(6660);
	});
});

describe('picking a thing for a workout', () => {
	it('says 20,000 lb is 3 Cybertrucks', () => {
		const pick = pickEquivalent(20000, () => 0, [cybertruck]);
		expect(pick && equivalentMessage(pick)).toBe("That's 3 Cybertrucks!");
	});

	it('only picks things the volume lifts at least one of', () => {
		// 10,000 lb lifts a dog and a Cybertruck, but not a bus.
		for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
			expect(pickEquivalent(10000, () => r, [dog, cybertruck, bus])?.item).not.toBe(bus);
		}
	});

	it('picks small things too, whatever the count', () => {
		// 10,000 lb is 142 dogs; that is a fine thing to say.
		expect(pickEquivalent(10000, () => 0, [dog, cybertruck])?.item).toBe(dog);
		expect(pickEquivalent(10000, () => 0.99, [dog, cybertruck])?.item).toBe(cybertruck);
	});

	it('says nothing below the lightest thing, or with no volume at all', () => {
		expect(pickEquivalent(0)).toBeNull();
		expect(pickEquivalent(0.5)).toBeNull();
		expect(pickEquivalent(50, () => 0, [dog])).toBeNull();
	});

	it('finds something for any real workout with the default table', () => {
		for (const volume of [5, 150, 900, 4000, 18000, 60000]) {
			expect(pickEquivalent(volume)).not.toBeNull();
		}
	});
});

describe('how the count reads', () => {
	it('keeps a tenth under ten, without a trailing .0', () => {
		expect(formatCount(3.003)).toBe('3');
		expect(formatCount(2.58)).toBe('2.5');
		expect(formatCount(1)).toBe('1');
	});

	it('rounds down to whole numbers from ten up', () => {
		expect(formatCount(37.9)).toBe('37');
		expect(formatCount(1234.5)).toBe('1,234');
	});

	it('uses the singular only for exactly one', () => {
		expect(equivalentMessage({ item: cybertruck, count: 1.04 })).toBe("That's 1 Cybertruck!");
		expect(equivalentMessage({ item: cybertruck, count: 1.5 })).toBe("That's 1.5 Cybertrucks!");
	});
});
