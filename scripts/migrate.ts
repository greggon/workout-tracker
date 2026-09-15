/**
 * Applies pending migrations.
 *
 * Deliberately not `drizzle-kit migrate`. SQLite cannot alter a column in
 * place, so drizzle migrates by rebuilding the table — and the CLI runs that
 * with foreign key enforcement ON, so dropping the old table cascades every
 * child row away. It is not hypothetical: it emptied days, sessions and
 * set_logs here twice before this script existed.
 *
 * This goes through the same guarded path the server uses at boot, so there is
 * one migration code path rather than two with different safety properties.
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, withForeignKeysDisabled } from '../src/lib/server/db/client';

const DATABASE_URL = process.env.DATABASE_URL ?? 'local.db';

const db = createDb(DATABASE_URL);

withForeignKeysDisabled(db, () => migrate(db, { migrationsFolder: 'drizzle' }));

const orphans = db.$client.pragma('foreign_key_check') as unknown[];
if (orphans.length > 0) {
	console.error(`Migration left ${orphans.length} row(s) with a broken foreign key.`);
	process.exit(1);
}

console.log(`Migrated ${DATABASE_URL}`);
