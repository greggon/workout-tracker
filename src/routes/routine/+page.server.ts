import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listDays } from '$lib/server/routine';
import { reorderDays, setSplit } from '$lib/server/routine-edit';
import { plannedSets, plannedVolume } from '$lib/volume';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const days = listDays(getDb(), locals.user.id);
	return {
		days: days.map((day) => {
			const planned = day.exercises.map((ex) => ({
				sets: ex.sets,
				reps: ex.reps,
				movements: [ex.main, ...(ex.pair ? [ex.pair] : [])]
			}));
			return {
				id: day.id,
				key: day.key,
				title: day.title,
				exerciseCount: day.exercises.length,
				sets: plannedSets(planned),
				volume: plannedVolume(planned)
			};
		})
	};
};

export const actions: Actions = {
	split: async ({ request, locals }) => {
		const form = await request.formData();
		const size = Number(form.get('size'));
		try {
			setSplit(getDb(), locals.user.id, size);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { ok: true };
	},

	reorder: async ({ request, locals }) => {
		const form = await request.formData();
		const order = String(form.get('order') ?? '')
			.split(',')
			.filter(Boolean);
		try {
			reorderDays(getDb(), locals.user.id, order);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		return { ok: true };
	}
};
