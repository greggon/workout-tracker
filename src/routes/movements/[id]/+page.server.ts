import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { movementHistory } from '$lib/server/history';
import { TOOL_LABELS } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const history = movementHistory(getDb(), locals.user.id, params.id);
	if (!history) error(404, 'No such movement');

	const back = url.searchParams.get('back') ?? '/movements';

	return {
		header: {
			kicker: history.tool ? TOOL_LABELS[history.tool] : 'Movement',
			title: history.name,
			back
		},
		history,
		/** Where the back link goes, so the workout screen is not lost. */
		back
	};
};
