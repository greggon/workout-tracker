import { db } from '$lib/server/db';
import { countSessions, lastSessionPerDay, listDays, recentSessions } from '$lib/server/routine';
import { plannedSets, plannedVolume, rotateFrom } from '$lib/volume';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
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

	return {
		days: rotateFrom(days, lastKey).map((day) => {
			const planned = day.exercises.map((ex) => ({
				sets: ex.sets,
				reps: ex.reps,
				movements: [ex.main, ...(ex.pair ? [ex.pair] : [])]
			}));
			const last = lastPerDay.get(day.key);
			return {
				id: day.id,
				key: day.key,
				title: day.title,
				exerciseCount: day.exercises.length,
				sets: plannedSets(planned),
				volume: plannedVolume(planned),
				lastAt: last ? last.startedAt.getTime() : null,
				chips: day.exercises.map((ex) =>
					ex.pair ? `${ex.main.name} → ${ex.pair.name}` : ex.main.name
				)
			};
		}),
		lastKey,
		lastAt: lastAt === -Infinity ? null : lastAt,
		splitSize: days.length,
		stats: {
			sessionCount: countSessions(db, userId),
			avgVolume: recent.length ? recent.reduce((a, r) => a + r.volume, 0) / recent.length : 0,
			avgMins: recent.length ? recent.reduce((a, r) => a + r.durationMins, 0) / recent.length : 0,
			sampleSize: recent.length
		}
	};
};
