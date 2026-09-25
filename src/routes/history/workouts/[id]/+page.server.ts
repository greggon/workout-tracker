import { error, fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { saveWorkoutEdits, workoutDetail, WorkoutEditError } from '$lib/server/workouts';
import type { PageHeader } from '$lib/shell/page-header';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const workout = workoutDetail(getDb(), locals.user.id, params.id);
	if (!workout) error(404, 'No such workout');

	return {
		header: {
			kicker: 'Edit workout',
			title: `${workout.dayKey} day`,
			// Back to the tab this was opened from.
			back: '/history?tab=workouts'
		} satisfies PageHeader,
		workout
	};
};

export const actions: Actions = {
	/**
	 * The editor posts the whole workout as JSON: every set's reps and each
	 * movement's weight. Validation is saveWorkoutEdits' job — it only lets
	 * through what this workout already has the shape for.
	 */
	save: async ({ request, params, locals }) => {
		const form = await request.formData();
		let edits: unknown;
		try {
			edits = JSON.parse(String(form.get('edits') ?? ''));
		} catch {
			return fail(400, { message: 'Could not read the changes.' });
		}
		try {
			saveWorkoutEdits(getDb(), locals.user.id, params.id, edits);
		} catch (e) {
			if (e instanceof WorkoutEditError) return fail(400, { message: e.message });
			throw e;
		}
		return { saved: true };
	}
};
