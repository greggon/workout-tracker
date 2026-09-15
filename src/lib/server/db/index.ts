import { env } from '$env/dynamic/private';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb } from './client';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const db = createDb(env.DATABASE_URL);

/**
 * Migrations run at import, and this module is imported by hooks.server.ts —
 * so they complete before the server answers its first request. A failure
 * throws and takes the process down, which is what we want: restarting into a
 * crash loop is far easier to notice than quietly serving queries against a
 * schema that is one migration behind.
 *
 * Uses drizzle-orm's own migrator rather than the drizzle-kit CLI, because
 * drizzle-kit is a devDependency and `pnpm prune --prod` removes it from the
 * image. The generated SQL in ./drizzle is copied in by the Dockerfile.
 */
migrate(db, { migrationsFolder: env.MIGRATIONS_DIR ?? 'drizzle' });

export * from './schema';
export type { Db } from './client';
