import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './db/client';
import { users } from './db/schema';
import { displayNameFor, resolveUser } from './users';

let db: Db;

beforeEach(() => {
	db = createDb(':memory:');
	migrate(db, { migrationsFolder: 'drizzle' });
});

describe('displayNameFor', () => {
	it('titles the local part, splitting on separators', () => {
		expect(displayNameFor('ada.lovelace@example.com')).toBe('Ada Lovelace');
		expect(displayNameFor('greg_smith@example.com')).toBe('Greg Smith');
		expect(displayNameFor('greg-smith-jr@example.com')).toBe('Greg Smith Jr');
		expect(displayNameFor('greg@example.com')).toBe('Greg');
	});

	it('survives repeated and trailing separators', () => {
		expect(displayNameFor('a..b.@example.com')).toBe('A B');
	});
});

describe('resolveUser', () => {
	it('provisions an account on first sight', () => {
		const user = resolveUser(db, 'greg@example.com');
		expect(user.email).toBe('greg@example.com');
		expect(user.displayName).toBe('Greg');
		expect(user.barWeight).toBe(45);
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it('returns the same account on later requests rather than duplicating', () => {
		const first = resolveUser(db, 'greg@example.com');
		const second = resolveUser(db, 'greg@example.com');
		expect(second.id).toBe(first.id);
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it('treats case and surrounding whitespace as the same identity', () => {
		const first = resolveUser(db, 'greg@example.com');
		const again = resolveUser(db, '  GREG@Example.COM  ');
		expect(again.id).toBe(first.id);
		expect(db.select().from(users).all()).toHaveLength(1);
	});

	it('keeps two different addresses isolated', () => {
		const a = resolveUser(db, 'greg@example.com');
		const b = resolveUser(db, 'friend@example.com');
		expect(a.id).not.toBe(b.id);
		expect(db.select().from(users).all()).toHaveLength(2);
	});

	it('does not overwrite a display name the account already has', () => {
		const user = resolveUser(db, 'greg@example.com');
		db.update(users).set({ displayName: 'Greg the Destroyer' }).run();

		expect(resolveUser(db, 'greg@example.com').displayName).toBe('Greg the Destroyer');
		expect(resolveUser(db, 'greg@example.com').id).toBe(user.id);
	});
});
