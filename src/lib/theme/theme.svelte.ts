import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';

/**
 * Light/dark, with "follow the system" as a real third state rather than a
 * guess made once at load.
 *
 * `system` stamps nothing, so the CSS media query decides and the app keeps
 * following the OS when it changes at sunset. An explicit choice stamps
 * `data-theme`, which wins in both directions.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Resolved = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'workout.theme';

/** Kept in sync with app.css so the address bar matches the page. */
const THEME_COLOR: Record<Resolved, string> = {
	dark: '#161826',
	light: '#eceff8'
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
	return value === 'system' || value === 'light' || value === 'dark';
}

const KEY = Symbol('theme');

export class Theme {
	choice = $state<ThemeChoice>('system');
	/** What the system currently says, tracked live. */
	systemPrefers = $state<Resolved>('dark');

	get resolved(): Resolved {
		return this.choice === 'system' ? this.systemPrefers : this.choice;
	}

	/** Cycles system → light → dark → system. */
	next(): ThemeChoice {
		return this.choice === 'system' ? 'light' : this.choice === 'light' ? 'dark' : 'system';
	}

	set(choice: ThemeChoice): void {
		this.choice = choice;
		if (!browser) return;

		try {
			if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
			else localStorage.setItem(THEME_STORAGE_KEY, choice);
		} catch {
			// Private window, or storage blocked. The choice still applies for
			// this visit; it just will not be remembered.
		}
		this.apply();
	}

	apply(): void {
		if (!browser) return;
		const root = document.documentElement;
		if (this.choice === 'system') root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', this.choice);

		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', THEME_COLOR[this.resolved]);
	}

	/** Reads the stored choice and starts tracking the OS. Returns a teardown. */
	start(): () => void {
		if (!browser) return () => {};

		try {
			const stored = localStorage.getItem(THEME_STORAGE_KEY);
			if (isThemeChoice(stored)) this.choice = stored;
		} catch {
			// Nothing stored we can read; `system` is the right fallback.
		}

		const query = window.matchMedia('(prefers-color-scheme: light)');
		const sync = () => {
			this.systemPrefers = query.matches ? 'light' : 'dark';
			this.apply();
		};
		sync();

		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	}
}

export function provideTheme(): Theme {
	return setContext(KEY, new Theme());
}

export function useTheme(): Theme {
	return getContext<Theme>(KEY);
}
