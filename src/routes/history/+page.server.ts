import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { movements, sessions, setLogs } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';
import type { PageHeader } from '$lib/shell/page-header';

/** Every movement this account has ever logged, most recently trained first. */
export const load: PageServerLoad = async ({ locals }) => {
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

	return {
		header: { title: 'My History 📈' } satisfies PageHeader,
		movements: rows
	};
};
