import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { movementHistory } from '$lib/server/history';
import { TOOL_LABELS } from '$lib/types';
import { safeBack } from '$lib/back';
import type { PageHeader } from '$lib/shell/page-header';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const history = movementHistory(getDb(), locals.user.id, params.id);
	if (!history) error(404, 'No such movement');

	/**
	 * Where the back chevron goes — the workout screen passes its own path so
	 * checking a movement mid-set returns you to it.
	 */
	const back = safeBack(url.searchParams.get('back'), '/history');

	return {
		header: {
			kicker: history.tool ? TOOL_LABELS[history.tool] : 'Movement',
			title: history.name,
			back
		} satisfies PageHeader,
		history,
		/** Where the back link goes, so the workout screen is not lost. */
		back
	};
};
