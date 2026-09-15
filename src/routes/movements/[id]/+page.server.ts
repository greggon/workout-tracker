import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { movementHistory } from '$lib/server/history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const history = movementHistory(getDb(), locals.user.id, params.id);
	if (!history) error(404, 'No such movement');

	return {
		history,
		/** Where the back link goes, so the workout screen is not lost. */
		back: url.searchParams.get('back') ?? '/'
	};
};
