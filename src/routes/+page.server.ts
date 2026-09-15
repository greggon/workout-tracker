import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: {
			displayName: locals.user.displayName,
			email: locals.user.email,
			barWeight: locals.user.barWeight,
			plateInventory: locals.user.plateInventory
		}
	};
};
