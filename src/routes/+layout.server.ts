import { env } from '$env/dynamic/private';
import { formatBuildTime } from '$lib/build-stamp';
import { getDb } from '$lib/server/db';
import { lastSessionPerDay, listDays } from '$lib/server/routine';
import { rotateFrom } from '$lib/volume';
import type { LayoutServerLoad } from './$types';

/**
 * Build stamp, plus the day the tab bar's centre button starts.
 *
 * The rotation lives here rather than on the home page because the tab bar is
 * on every screen — asking each route to compute it would be four copies of the
 * same "what is next" rule.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const days = listDays(getDb(), locals.user.id);
	const lastPerDay = lastSessionPerDay(
		getDb(),
		locals.user.id,
		days.map((d) => d.key)
	);

	let lastKey: string | null = null;
	let lastAt = -Infinity;
	for (const [key, session] of lastPerDay) {
		if (session.startedAt.getTime() > lastAt) {
			lastAt = session.startedAt.getTime();
			lastKey = key;
		}
	}

	return {
		nextDayId: rotateFrom(days, lastKey)[0]?.id ?? null,
		build: {
			sha: (env.GIT_SHA ?? 'dev').slice(0, 7),
			time: formatBuildTime(env.BUILD_TIME ?? 'local'),
			timeISO: env.BUILD_TIME ?? ''
		}
	};
};
