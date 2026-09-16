import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { lastLogPerMovement, listDays } from '$lib/server/routine';
import type { PageServerLoad } from './$types';
import type { PageHeader } from '$lib/shell/page-header';

export const load: PageServerLoad = async ({ params, locals }) => {
	const day = listDays(getDb(), locals.user.id).find((d) => d.id === params.id);
	if (!day) error(404, 'No such day');
	if (day.exercises.length === 0) error(400, 'This day has no exercises yet');

	const movementIds = day.exercises.flatMap((ex) =>
		ex.pair ? [ex.main.movementId, ex.pair.movementId] : [ex.main.movementId]
	);

	return {
		header: { kicker: day.title, title: `${day.key} day` } satisfies PageHeader,
		day,
		lastLogs: Object.fromEntries(lastLogPerMovement(getDb(), locals.user.id, movementIds)),
		loading: {
			barWeight: locals.user.barWeight,
			ezBarWeight: locals.user.ezBarWeight,
			inventory: locals.user.plateInventory
		}
	};
};
