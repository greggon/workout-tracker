/**
 * What a route tells the header about itself.
 *
 * Declared once, and declared on `App.PageData`, so the six loads that supply a
 * header and the one component that reads it agree by type-checking rather than
 * by everyone remembering the same object shape. Before this it was six literals
 * and a cast: a typo, or a new route that forgot the key, degraded silently to a
 * blank header.
 *
 * It lives on `data` rather than on the chrome context because effects do not
 * run during SSR, so a header driven by one renders empty in the server HTML and
 * fills in only after hydration — a flash on every load.
 */
export type PageHeader = {
	/** Small caps, above the title. */
	kicker: string;
	title: string;
	/**
	 * Where the back chevron goes. Omitted on a root screen. Already-resolved,
	 * because it crosses the load boundary as a plain string.
	 */
	back?: string | null;
};
