/**
 * Development seed: loads the routine from the Liftup design plus four weeks of
 * back-dated history, for two isolated accounts.
 *
 *   pnpm db:seed             # refuses if sessions already exist
 *   pnpm db:seed --force     # wipes and reseeds
 *
 * The second account's weights are scaled down so that any query missing its
 * `user_id` filter shows up as obviously wrong numbers rather than plausible ones.
 */
import { createDb } from '../src/lib/server/db/client';
import {
	dayExercises,
	days,
	movements,
	sessions,
	setLogs,
	users,
	type DayKey,
	type Tool
} from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'local.db';
const FORCE = process.argv.includes('--force');

// Real addresses live in .env, which is gitignored — these are only fallbacks
// so a fresh clone can seed without configuration. They must match the email
// claim in the Cloudflare Access JWT to resolve to an account at runtime.
const PRIMARY_EMAIL = process.env.SEED_EMAIL ?? 'you@example.com';
const FRIEND_EMAIL = process.env.SEED_FRIEND_EMAIL ?? 'friend@example.com';

/** "ada.lovelace@x.com" → "Ada Lovelace" */
function displayNameFor(email: string): string {
	return email
		.split('@')[0]
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(' ');
}

const DAY_MS = 86_400_000;

type ExerciseSeed = {
	name: string;
	tool: Tool;
	weight: number;
	sets: number;
	reps: number;
	pair?: { name: string; tool: Tool; weight: number };
	note?: string;
};

type DaySeed = { key: DayKey; title: string; exercises: ExerciseSeed[] };

/** Verbatim from the design's seed(), including the placeholder lower day. */
const ROUTINE: DaySeed[] = [
	{
		key: 'A',
		title: 'Monday · Upper push/pull',
		exercises: [
			{
				name: 'Landmine row',
				tool: 'barbell',
				weight: 41,
				sets: 2,
				reps: 10,
				pair: { name: 'Incline dumbbell press', tool: 'dumbbell', weight: 40 }
			},
			{
				name: 'Cable face pulldown',
				tool: 'pulley',
				weight: 102,
				sets: 3,
				reps: 12,
				note: 'Myorep break · drop load each set'
			},
			{
				name: 'Dumbbell skullcrusher',
				tool: 'dumbbell',
				weight: 30,
				sets: 2,
				reps: 10,
				pair: { name: 'Seated dumbbell curl', tool: 'dumbbell', weight: 30 }
			},
			{
				name: 'Leg extension',
				tool: 'machine',
				weight: 225,
				sets: 2,
				reps: 12,
				pair: { name: 'Lying leg curl', tool: 'machine', weight: 145 }
			}
		]
	},
	{
		key: 'B',
		title: 'Wednesday · Upper',
		exercises: [
			{
				name: 'Close grip bench',
				tool: 'barbell',
				weight: 117.5,
				sets: 2,
				reps: 8,
				pair: { name: 'Underhand pulldown', tool: 'pulley', weight: 117.5 }
			},
			{
				name: 'Barbell upright row',
				tool: 'barbell',
				weight: 61,
				sets: 2,
				reps: 10,
				pair: { name: 'Standing barbell press', tool: 'barbell', weight: 55 }
			},
			{
				name: 'Barbell curl',
				tool: 'barbell',
				weight: 60,
				sets: 2,
				reps: 10,
				pair: { name: 'Overhead EZ extension', tool: 'barbell', weight: 50 }
			}
		]
	},
	{
		key: 'C',
		title: 'Friday · Lower (placeholder)',
		exercises: [
			{
				name: 'Hack squat',
				tool: 'machine',
				weight: 180,
				sets: 2,
				reps: 12,
				pair: { name: 'Seated calf raise', tool: 'machine', weight: 90 }
			},
			{
				name: 'Romanian deadlift',
				tool: 'barbell',
				weight: 135,
				sets: 2,
				reps: 10,
				pair: { name: 'Hamstring curl', tool: 'machine', weight: 125 }
			},
			{
				name: 'Cable lateral raise',
				tool: 'pulley',
				weight: 25,
				sets: 3,
				reps: 15,
				note: 'Myorep break'
			}
		]
	}
];

/** Every distinct movement in the routine, as the shared catalog. */
function catalogEntries(): { name: string; tool: Tool }[] {
	const seen = new Map<string, Tool>();
	for (const day of ROUTINE) {
		for (const ex of day.exercises) {
			if (!seen.has(ex.name)) seen.set(ex.name, ex.tool);
			if (ex.pair && !seen.has(ex.pair.name)) seen.set(ex.pair.name, ex.pair.tool);
		}
	}
	return [...seen].map(([name, tool]) => ({ name, tool }));
}

/** Round to the nearest half pound — the finest increment the plate set allows. */
const half = (n: number) => Math.round(n * 2) / 2;

function main() {
	const db = createDb(DATABASE_URL);

	const existing = db.select({ id: sessions.id }).from(sessions).all();
	if (existing.length > 0 && !FORCE) {
		console.error(
			`Refusing to seed: ${existing.length} session(s) already in ${DATABASE_URL}.\n` +
				`Re-run with --force to wipe and reseed.`
		);
		process.exit(1);
	}

	db.transaction((tx) => {
		// Children first — foreign_keys is ON, and cascades only fire on parent deletes.
		tx.delete(setLogs).run();
		tx.delete(sessions).run();
		tx.delete(dayExercises).run();
		tx.delete(days).run();
		tx.delete(movements).run();
		tx.delete(users).run();

		// ---- shared movement catalog (owner_user_id null) ----------------------
		const movementId = new Map<string, string>();
		const catalog = catalogEntries().map((m) => {
			const id = crypto.randomUUID();
			movementId.set(m.name, id);
			return { id, name: m.name, ownerUserId: null, defaultTool: m.tool };
		});
		tx.insert(movements).values(catalog).run();

		// ---- accounts ----------------------------------------------------------
		const accounts = [
			{ email: PRIMARY_EMAIL, displayName: displayNameFor(PRIMARY_EMAIL), scale: 1 },
			{ email: FRIEND_EMAIL, displayName: displayNameFor(FRIEND_EMAIL), scale: 0.85 }
		];

		let sessionCount = 0;
		let setLogCount = 0;

		for (const account of accounts) {
			const userId = crypto.randomUUID();
			tx.insert(users)
				.values({ id: userId, email: account.email, displayName: account.displayName })
				.run();

			for (const [dayIndex, daySeed] of ROUTINE.entries()) {
				const dayId = crypto.randomUUID();
				tx.insert(days)
					.values({
						id: dayId,
						userId,
						key: daySeed.key,
						position: dayIndex,
						title: daySeed.title
					})
					.run();

				const exerciseRows = daySeed.exercises.map((ex, position) => ({
					id: crypto.randomUUID(),
					dayId,
					position,
					movementId: movementId.get(ex.name)!,
					tool: ex.tool,
					weight: half(ex.weight * account.scale),
					pairMovementId: ex.pair ? movementId.get(ex.pair.name)! : null,
					pairTool: ex.pair?.tool ?? null,
					pairWeight: ex.pair ? half(ex.pair.weight * account.scale) : null,
					sets: ex.sets,
					reps: ex.reps,
					note: ex.note ?? ''
				}));
				tx.insert(dayExercises).values(exerciseRows).run();

				// ---- four back-dated sessions, weights trending up toward today ----
				for (const weeksAgo of [4, 3, 2, 1]) {
					const startedAt = new Date(Date.now() - (weeksAgo * 7 + 2) * DAY_MS);
					const durationMins = 52 + weeksAgo * 3;
					const endedAt = new Date(startedAt.getTime() + durationMins * 60_000);
					const sessionId = crypto.randomUUID();

					tx.insert(sessions)
						.values({
							id: sessionId,
							userId,
							dayId,
							dayKey: daySeed.key,
							dayTitle: daySeed.title,
							startedAt,
							endedAt,
							durationMins,
							syncedAt: endedAt
						})
						.run();
					sessionCount++;

					const logs = [];
					for (const [exerciseIndex, row] of exerciseRows.entries()) {
						const slots = [
							{ slot: 0, movementId: row.movementId, tool: row.tool, weight: row.weight },
							...(row.pairMovementId
								? [
										{
											slot: 1,
											movementId: row.pairMovementId,
											tool: row.pairTool!,
											weight: row.pairWeight!
										}
									]
								: [])
						];

						for (const s of slots) {
							// Same taper the design uses: ~2.2% lighter per week back,
							// and a rep short on the two oldest sessions.
							const weight = Math.max(5, half(s.weight * (1 - weeksAgo * 0.022)));
							const reps = row.reps - (weeksAgo > 2 ? 1 : 0);
							for (let setIndex = 0; setIndex < row.sets; setIndex++) {
								logs.push({
									id: crypto.randomUUID(),
									sessionId,
									dayExerciseId: row.id,
									movementId: s.movementId,
									exerciseIndex,
									setIndex,
									slot: s.slot,
									tool: s.tool,
									weight,
									reps,
									loggedAt: new Date(
										startedAt.getTime() + (exerciseIndex * 8 + setIndex * 3) * 60_000
									)
								});
							}
						}
					}
					tx.insert(setLogs).values(logs).run();
					setLogCount += logs.length;
				}
			}
		}

		console.log(`Seeded ${DATABASE_URL}`);
		console.log(`  users        ${accounts.length}  (${accounts.map((a) => a.email).join(', ')})`);
		console.log(`  movements    ${catalog.length}  (shared catalog)`);
		console.log(`  days         ${accounts.length * ROUTINE.length}`);
		console.log(`  sessions     ${sessionCount}`);
		console.log(`  set_logs     ${setLogCount}`);
	});
}

main();
