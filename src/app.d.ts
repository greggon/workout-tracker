// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/**
			 * The authenticated account. Always present: hooks.server.ts answers
			 * 401 before any route runs, so routes never handle an absent user.
			 * Every query must scope on this id rather than anything from the
			 * request — that is the whole of the account isolation model.
			 */
			user: import('$lib/server/db/schema').User;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
