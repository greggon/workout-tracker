import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { updateSettings } from '$lib/server/users';
import { normalizeStock } from '$lib/plates';
import type { Actions, PageServerLoad } from './$types';
import type { PageHeader } from '$lib/shell/page-header';

export const load: PageServerLoad = async ({ locals }) => ({
	header: { title: 'My Gear 🏋️' } satisfies PageHeader,
	settings: {
		barWeight: locals.user.barWeight,
		ezBarWeight: locals.user.ezBarWeight,
		plateInventory: locals.user.plateInventory
	}
});

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const form = await request.formData();
		const count = Number(form.get('rows') ?? 0);
		// normalizeStock validates the color; anything that is not a hex value
		// falls back to plain iron rather than reaching an SVG fill.
		const plateInventory = normalizeStock(
			Array.from({ length: count }, (_, i) => ({
				weight: Number(form.get(`weight-${i}`)),
				count: Number(form.get(`count-${i}`)),
				color: String(form.get(`color-${i}`) ?? '')
			}))
		);
		if (plateInventory.length === 0) {
			return fail(400, { message: 'List at least one plate you own.' });
		}

		const barWeight = Number(form.get('barWeight'));
		const ezBarWeight = Number(form.get('ezBarWeight'));
		if (!Number.isFinite(barWeight) || !Number.isFinite(ezBarWeight)) {
			return fail(400, { message: 'Bar weights must be numbers.' });
		}

		updateSettings(getDb(), locals.user.id, { barWeight, ezBarWeight, plateInventory });
		return { saved: true };
	}
};
