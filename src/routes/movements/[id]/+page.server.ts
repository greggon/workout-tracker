import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { movementHistory } from '$lib/server/history';
import { TOOL_LABELS } from '$lib/types';
import type { PageHeader } from '$lib/shell/page-header';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const history = movementHistory(getDb(), locals.user.id, params.id);
	if (!history) error(404, 'No such movement');

	/**
	 * Where the back chevron goes — the workout screen passes its own path so
	 * checking a movement mid-set returns you to it.
	 *
	 * Only a path off this origin is accepted. The value is rendered straight
	 * into an href, and "//evil.example" or "https://…" in a query parameter is
	 * how a back link becomes someone else's site.
	 */
	const requested = url.searchParams.get('back') ?? '';
	const back = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/movements';

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
