import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { days, movements } from '$lib/server/db/schema';
import { listDays } from '$lib/server/routine';
import { saveDay, type ExerciseInput } from '$lib/server/routine-edit';
import { TOOLS, type Tool } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const day = listDays(getDb(), locals.user.id).find((d) => d.id === params.id);
	if (!day) error(404, 'No such day');

	// Typeahead source: the shared catalog plus this account's own movements.
	const catalog = getDb()
		.select({ name: movements.name, defaultTool: movements.defaultTool })
		.from(movements)
		.where(or(isNull(movements.ownerUserId), eq(movements.ownerUserId, locals.user.id)))
		.orderBy(movements.name)
		.all();

	return { day, catalog };
};

function parseTool(value: FormDataEntryValue | null, fallback: Tool): Tool {
	const v = String(value ?? '');
	return (TOOLS as readonly string[]).includes(v) ? (v as Tool) : fallback;
}

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const form = await request.formData();
		const owned = getDb()
			.select({ id: days.id })
			.from(days)
			.where(and(eq(days.id, params.id), eq(days.userId, locals.user.id)))
			.get();
		if (!owned) error(404, 'No such day');

		const count = Number(form.get('count') ?? 0);
		const exercises: ExerciseInput[] = [];
		for (let i = 0; i < count; i++) {
			const name = String(form.get(`name-${i}`) ?? '').trim();
			if (!name) continue; // a row cleared of its movement is a deletion
			const tool = parseTool(form.get(`tool-${i}`), 'barbell');
			const pairName = String(form.get(`pairName-${i}`) ?? '').trim();
			exercises.push({
				id: (form.get(`id-${i}`) as string) || null,
				name,
				tool,
				weight: Number(form.get(`weight-${i}`) ?? 0),
				pairName: pairName || null,
				pairTool: pairName ? parseTool(form.get(`pairTool-${i}`), tool) : null,
				pairWeight: pairName ? Number(form.get(`pairWeight-${i}`) ?? 0) : null,
				sets: Math.max(1, Number(form.get(`sets-${i}`) ?? 1)),
				reps: Math.max(1, Number(form.get(`reps-${i}`) ?? 1)),
				note: String(form.get(`note-${i}`) ?? '').trim()
			});
		}

		try {
			saveDay(getDb(), locals.user.id, params.id, String(form.get('title') ?? ''), exercises);
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
		redirect(303, '/routine');
	}
};
