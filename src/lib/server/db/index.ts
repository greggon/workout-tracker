import { env } from '$env/dynamic/private';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, withForeignKeysDisabled, type Db } from './client';

let instance: Db | undefined;

/**
 * Opens the database on first use and applies migrations once.
 *
 * Deliberately a function rather than an eagerly-created `db` export: SvelteKit
 * imports every `+page.server.ts` at build time to read its page options, so a
 * module-level connection runs during `vite build`. That fails the image build
 * where DATABASE_URL is unset, and where it is set it would migrate a stray
 * database into the image layer.
 *
 * `hooks.server.ts` calls this from the `init` hook, so migrations still finish
 * before the server accepts its first request rather than on a user's request.
 */
export function getDb(): Db {
	if (instance) return instance;

	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	const db = createDb(env.DATABASE_URL);

	// See withForeignKeysDisabled: a table rebuild would otherwise cascade every
	// child row away. This is not a theoretical risk — it happened once.
	withForeignKeysDisabled(db, () =>
		migrate(db, { migrationsFolder: env.MIGRATIONS_DIR ?? 'drizzle' })
	);

	const orphans = db.$client.pragma('foreign_key_check') as unknown[];
	if (orphans.length > 0) {
		throw new Error(
			`Migration left ${orphans.length} row(s) with a broken foreign key; refusing to serve.`
		);
	}

	instance = db;
	return instance;
}

export * from './schema';
export type { Db, Queryable, Tx } from './client';
