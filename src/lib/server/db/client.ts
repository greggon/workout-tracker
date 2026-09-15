import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

/**
 * Connection factory with no SvelteKit dependency, so CLI scripts (seed,
 * backup checks) can open the same database the app does, with the same
 * pragmas. Anything that imports `$env` cannot run outside `vite`.
 */
export function createDb(url: string) {
	const client = new Database(url);

	// WAL lets the nightly VACUUM INTO snapshot run without blocking writes,
	// and is what Litestream replicates from.
	client.pragma('journal_mode = WAL');
	// NORMAL is the right durability trade under WAL: survives process crash,
	// risks only the last transactions on sudden power loss.
	client.pragma('synchronous = NORMAL');
	// SQLite defaults foreign keys OFF, per connection. Every onDelete rule in
	// the schema is inert without this.
	client.pragma('foreign_keys = ON');
	client.pragma('busy_timeout = 5000');

	return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

/** The handle drizzle hands to a `db.transaction()` callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Anything that can run a query. Helpers take this so they compose inside a
 * transaction as well as standalone — a plain `Db` is not assignable from a
 * transaction, and casting between them hides real mistakes.
 */
export type Queryable = Db | Tx;
