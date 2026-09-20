import { getDb } from '$lib/server/db';
import { countSessions, lastSessionPerDay, listDays, recentSessions } from '$lib/server/routine';
import { plannedFrom, plannedMovements, plannedSets, plannedVolume, rotateFrom } from '$lib/volume';
import type { PageServerLoad } from './$types';
import type { PageHeader } from '$lib/shell/page-header';

export const load: PageServerLoad = async ({ locals }) => {
	const db = getDb();
	const userId = locals.user.id;

	const days = listDays(db, userId);
	const lastPerDay = lastSessionPerDay(
		db,
		userId,
		days.map((d) => d.key)
	);

	// The rotation starts after whichever day was trained most recently.
	let lastKey: string | null = null;
	let lastAt = -Infinity;
	for (const [key, session] of lastPerDay) {
		if (session.startedAt.getTime() > lastAt) {
			lastAt = session.startedAt.getTime();
			lastKey = key;
		}
	}

	const recent = recentSessions(db, userId, 4);
	const average = (pick: (s: (typeof recent)[number]) => number) =>
		recent.length ? recent.reduce((total, s) => total + pick(s), 0) / recent.length : 0;

	return {
		header: { title: "Let's lift 💪" } satisfies PageHeader,
		days: rotateFrom(days, lastKey).map((day) => {
			const planned = plannedFrom(day.exercises);
			const last = lastPerDay.get(day.key);
			return {
				id: day.id,
				key: day.key,
				title: day.title,
				// Both halves of a superset: two lifts to do, not one row to read.
				exerciseCount: plannedMovements(planned),
				sets: plannedSets(planned),
				volume: plannedVolume(planned),
				lastAt: last ? last.startedAt.getTime() : null,
				chips: day.exercises.map((ex) =>
					ex.pair ? `${ex.main.name} → ${ex.pair.name}` : ex.main.name
				)
			};
		}),
		stats: {
			sessionCount: countSessions(db, userId),
			avgVolume: average((s) => s.volume),
			avgMins: average((s) => s.durationMins)
		}
	};
};
