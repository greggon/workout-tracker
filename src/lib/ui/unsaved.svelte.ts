import { beforeNavigate, goto } from '$app/navigation';

/**
 * Asks before navigation throws away unsaved edits.
 *
 * Only on the way out: something on screen nagging to save the whole time is
 * noise you learn to look past, and leaving is the one moment the edits are
 * actually about to be lost. Gear had this and the day editor did not, so a
 * tap on a tab mid-edit dropped a whole day's changes without a word.
 *
 * Construct it during component setup — `beforeNavigate` has to be.
 */
export class UnsavedGuard {
	/** Where the cancelled navigation was headed; the dialog is open while set. */
	leavingTo = $state<URL | null>(null);

	#passing = false;

	/**
	 * @param dirty whether anything has been typed that a save would write
	 * @param routeId navigating within this route (a save's own reload) never asks
	 */
	constructor(dirty: () => boolean, routeId: string) {
		beforeNavigate((nav) => {
			if (this.#passing || !dirty()) return;
			if (nav.to?.route.id === routeId) return;

			// Closing the tab or reloading: the browser owns that dialog, and
			// cancelling is what asks it to put one up.
			nav.cancel();
			if (nav.type === 'leave') return;
			this.leavingTo = nav.to?.url ?? null;
		});
	}

	/**
	 * Lets navigation through without asking — for a save that submits as a
	 * native form, or an explicit Cancel, where leaving is the point.
	 */
	pass() {
		this.#passing = true;
	}

	/** Closes the dialog and stays. */
	stay() {
		this.leavingTo = null;
	}

	/** Carries on to wherever the cancelled navigation was going. */
	async go() {
		const to = this.leavingTo;
		this.leavingTo = null;
		if (!to) return;
		this.#passing = true;
		try {
			// The destination came from SvelteKit's own navigation event, so it
			// is already resolved; resolve() would be resolving a resolved path.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(to);
		} finally {
			this.#passing = false;
		}
	}
}
