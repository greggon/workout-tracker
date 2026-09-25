import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { DEFAULT_PLATE_STOCK, type DayKey, type PlateStock, type Tool } from '../../types';

/**
 * All weights are stored in pounds. Both accounts lift in lbs, so there is no
 * canonical-unit conversion layer anywhere in this schema — see the build spec.
 */

export type { Tool, DayKey } from '../../types';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

/**
 * Identity comes from the verified Cloudflare Access JWT. There is deliberately
 * no password column and no session table — Access owns both.
 */
export const users = sqliteTable('users', {
	id: id(),
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull().default(''),
	/** Weight of an empty barbell, subtracted before the per-side plate fill. */
	barWeight: real('bar_weight').notNull().default(45),
	/** Weight of the empty EZ curl bar. */
	ezBarWeight: real('ez_bar_weight').notNull().default(30),
	/** Plates this person owns, with quantities. Heaviest first. */
	plateInventory: text('plate_inventory', { mode: 'json' })
		.$type<PlateStock[]>()
		.notNull()
		.default(DEFAULT_PLATE_STOCK),
	createdAt: createdAt()
});

/**
 * Shared catalog when `ownerUserId` is null, otherwise a user's private
 * movement. History hangs off this id rather than off a name string, so a
 * rename never orphans a log and one account's spelling never affects another.
 */
export const movements = sqliteTable(
	'movements',
	{
		id: id(),
		name: text('name').notNull(),
		ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
		defaultTool: text('default_tool').$type<Tool>().notNull(),
		createdAt: createdAt()
	},
	(t) => [
		// NULL never compares equal in a SQL UNIQUE, so the global catalog and the
		// per-user movements each need their own partial index.
		uniqueIndex('movements_global_name_unq')
			.on(t.name)
			.where(sql`${t.ownerUserId} is null`),
		uniqueIndex('movements_owner_name_unq')
			.on(t.ownerUserId, t.name)
			.where(sql`${t.ownerUserId} is not null`),
		index('movements_name_idx').on(t.name)
	]
);

export const days = sqliteTable(
	'days',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		key: text('key').$type<DayKey>().notNull(),
		/** Rotation order. Not unique: reordering rewrites the whole sibling set. */
		position: integer('position').notNull(),
		title: text('title').notNull()
	},
	(t) => [
		uniqueIndex('days_user_key_unq').on(t.userId, t.key),
		index('days_user_position_idx').on(t.userId, t.position)
	]
);

/**
 * One row per exercise slot in a day. A non-null `pairMovementId` makes it a
 * superset — the design renders the pair as "main → pair" and logs both.
 */
export const dayExercises = sqliteTable(
	'day_exercises',
	{
		id: id(),
		dayId: text('day_id')
			.notNull()
			.references(() => days.id, { onDelete: 'cascade' }),
		position: integer('position').notNull(),

		movementId: text('movement_id')
			.notNull()
			.references(() => movements.id, { onDelete: 'restrict' }),
		tool: text('tool').$type<Tool>().notNull(),
		weight: real('weight').notNull(),

		pairMovementId: text('pair_movement_id').references(() => movements.id, {
			onDelete: 'restrict'
		}),
		pairTool: text('pair_tool').$type<Tool>(),
		pairWeight: real('pair_weight'),

		sets: integer('sets').notNull(),
		reps: integer('reps').notNull(),
		note: text('note').notNull().default(''),
		/**
		 * Warm-up sets before the working sets, for the main movement: each its
		 * own weight and reps, lightest first. Empty for most exercises — they
		 * are optional. JSON rather than a table: they are only ever read and
		 * written whole, with the exercise they belong to.
		 */
		warmups: text('warmups', { mode: 'json' })
			.$type<{ weight: number; reps: number }[]>()
			.notNull()
			.default(sql`'[]'`)
	},
	(t) => [index('day_exercises_day_position_idx').on(t.dayId, t.position)]
);

/**
 * `id` is minted client-side with crypto.randomUUID() when the workout starts,
 * and is the idempotency key for the sync queue: a replayed POST upserts.
 *
 * `dayKey` is denormalized on purpose. `dayId` goes null if the routine is
 * later restructured, but the summary chart still needs to find "the last four
 * B-day sessions" years after that day was edited.
 */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dayId: text('day_id').references(() => days.id, { onDelete: 'set null' }),
		dayKey: text('day_key').$type<DayKey>().notNull(),
		dayTitle: text('day_title').notNull().default(''),

		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		endedAt: integer('ended_at', { mode: 'timestamp_ms' }).notNull(),
		durationMins: integer('duration_mins').notNull(),
		/** Null until the server has accepted it; set on upsert. */
		syncedAt: integer('synced_at', { mode: 'timestamp_ms' })
	},
	(t) => [
		index('sessions_user_day_started_idx').on(t.userId, t.dayKey, t.startedAt),
		index('sessions_user_started_idx').on(t.userId, t.startedAt)
	]
);

/**
 * The atomic record. Volume is never stored — every chart in the design is a
 * SUM() over these rows, so a corrected weight reflows history automatically
 * and a new chart costs a query rather than a migration.
 */
export const setLogs = sqliteTable(
	'set_logs',
	{
		id: id(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		/** Nulled rather than deleted when the routine is edited. */
		dayExerciseId: text('day_exercise_id').references(() => dayExercises.id, {
			onDelete: 'set null'
		}),
		movementId: text('movement_id')
			.notNull()
			.references(() => movements.id, { onDelete: 'restrict' }),

		/** Position of the exercise within the day, mirroring the design's log key. */
		exerciseIndex: integer('exercise_index').notNull(),
		setIndex: integer('set_index').notNull(),
		/** 0 = main movement, 1 = the superset pair. */
		slot: integer('slot').notNull(),
		/**
		 * A warm-up set rather than a working one. Warm-ups count toward volume
		 * like any other set; they are numbered on their own (`setIndex` 0, 1, 2…
		 * among the warm-ups), so the flag is part of what makes a set unique.
		 */
		warmup: integer('warmup', { mode: 'boolean' }).notNull().default(false),

		tool: text('tool').$type<Tool>().notNull(),
		weight: real('weight').notNull(),
		reps: integer('reps').notNull(),
		loggedAt: integer('logged_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [
		index('set_logs_session_idx').on(t.sessionId),
		index('set_logs_movement_logged_idx').on(t.movementId, t.loggedAt),
		uniqueIndex('set_logs_slot_unq').on(t.sessionId, t.exerciseIndex, t.warmup, t.setIndex, t.slot)
	]
);

export type User = typeof users.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Day = typeof days.$inferSelect;
export type DayExercise = typeof dayExercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SetLog = typeof setLogs.$inferSelect;
