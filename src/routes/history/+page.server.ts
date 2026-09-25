import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { movements, sessions, setLogs } from '$lib/server/db/schema';
import { listWorkouts } from '$lib/server/workouts';
import type { PageServerLoad } from './$types';
import type { PageHeader } from '$lib/shell/page-header';

/**
 * Two views of the same history, as tabs: every movement ever logged (the
 * lifts), or every workout, newest first, each of which can be opened and
 * corrected. The tab is in the URL, so a workout's back link returns to it.
 * Only the open tab's list is loaded.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const header = { title: 'My History 📈' } satisfies PageHeader;

	if (url.searchParams.get('tab') === 'workouts') {
		return {
			header,
			tab: 'workouts' as const,
			workouts: listWorkouts(getDb(), locals.user.id),
			movements: []
		};
	}

	// Every movement this account has ever logged, most recently trained first.
	const rows = getDb()
		.select({
			movementId: setLogs.movementId,
			name: movements.name,
			tool: setLogs.tool,
			lastAt: sql<number>`max(${setLogs.loggedAt})`,
			sessionCount: sql<number>`count(distinct ${setLogs.sessionId})`
		})
		.from(setLogs)
		.innerJoin(sessions, eq(sessions.id, setLogs.sessionId))
		.innerJoin(movements, eq(movements.id, setLogs.movementId))
		.where(eq(sessions.userId, locals.user.id))
		.groupBy(setLogs.movementId)
		.orderBy(desc(sql`max(${setLogs.loggedAt})`))
		.all();

	return { header, tab: 'lifts' as const, workouts: [], movements: rows };
};
