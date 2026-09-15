import { getContext, setContext } from 'svelte';

const KEY = Symbol('app-chrome');

/**
 * State for the sticky header, owned by the root layout and written by
 * whichever route is active. The design has one header that changes contents
 * per screen — clocks and a progress bar appear only during a workout — rather
 * than a different header per route.
 *
 * Deliberately created per component tree instead of at module scope: a
 * module-level rune on the server is shared between concurrent requests, so
 * one person's running clock would bleed into another's page.
 */
export class Chrome {
	/** Elapsed since the workout started, preformatted. Null hides the clocks. */
	sessionClock = $state<string | null>(null);
	/** Elapsed since the last logged set. */
	restClock = $state<string | null>(null);
	/** Sets completed, 0 to 1. Null hides the bar. */
	progress = $state<number | null>(null);
	/** Shown as the gear button when set. */
	onEdit = $state<(() => void) | null>(null);

	/** Routes call this on unmount so chrome never outlives the screen. */
	clear() {
		this.sessionClock = null;
		this.restClock = null;
		this.progress = null;
		this.onEdit = null;
	}
}

export function provideChrome(): Chrome {
	return setContext(KEY, new Chrome());
}

export function useChrome(): Chrome {
	return getContext<Chrome>(KEY);
}
