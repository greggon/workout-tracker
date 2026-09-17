import { resolve } from '$app/paths';

/**
 * The four destinations, in one place.
 *
 * Both navigations render these: the floating tab bar on a phone and the rail
 * on a desktop window. Keeping the list here is what stops the two drifting —
 * they are the same app, shown at two sizes, not two navigations.
 */
export type Destination = {
	label: string;
	href: string;
	/** Which glyph NavIcon draws beside the label in the rail. */
	icon: 'today' | 'routine' | 'history' | 'gear';
	/** Highlights the destination you are inside, not just the one you are on. */
	match: (path: string) => boolean;
};

export function destinations(): Destination[] {
	return [
		{ label: 'Up Next', href: resolve('/'), icon: 'today', match: (p) => p === '/' },
		{
			label: 'Routine',
			href: resolve('/routine'),
			icon: 'routine',
			match: (p) => p.startsWith('/routine')
		},
		{
			label: 'History',
			href: resolve('/history'),
			icon: 'history',
			match: (p) => p.startsWith('/history')
		},
		{
			label: 'Gear',
			href: resolve('/gear'),
			icon: 'gear',
			match: (p) => p.startsWith('/gear')
		}
	];
}
