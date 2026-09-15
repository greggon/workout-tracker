import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import type { PlateStock } from '$lib/types';
import { users, type User } from './db/schema';

/** "ada.lovelace@example.com" → "Ada Lovelace" */
export function displayNameFor(email: string): string {
	return email
		.split('@')[0]
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(' ');
}

/**
 * Resolves a verified Access email to an account, creating one on first sight.
 *
 * Auto-provisioning is safe because the Cloudflare Access policy is the gate —
 * an unverified or unauthorised address never reaches this function. Widening
 * the Access policy widens who gets an account, which is the intended behaviour.
 */
export function resolveUser(db: Db, email: string): User {
	const normalised = email.trim().toLowerCase();

	const existing = db.select().from(users).where(eq(users.email, normalised)).get();
	if (existing) return existing;

	// onConflictDoNothing covers the race between two concurrent first requests;
	// the follow-up select then returns whichever insert won.
	db.insert(users)
		.values({ email: normalised, displayName: displayNameFor(normalised) })
		.onConflictDoNothing({ target: users.email })
		.run();

	const created = db.select().from(users).where(eq(users.email, normalised)).get();
	if (!created) throw new Error(`Failed to provision account for ${normalised}`);
	return created;
}

export type Settings = {
	barWeight: number;
	ezBarWeight: number;
	plateInventory: PlateStock[];
};

/** Equipment settings. Weights are clamped to something physically sane. */
export function updateSettings(db: Db, userId: string, settings: Settings): void {
	db.update(users)
		.set({
			barWeight: Math.max(0, settings.barWeight),
			ezBarWeight: Math.max(0, settings.ezBarWeight),
			plateInventory: settings.plateInventory
		})
		.where(eq(users.id, userId))
		.run();
}
