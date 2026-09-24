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
	/**
	 * Small caps, above the title. Omitted on the screens whose title says it
	 * all — a kicker reading "Routine" over a title reading "My Routine" is the
	 * same word twice in two sizes.
	 */
	kicker?: string;
	title: string;
	/**
	 * Where the back chevron goes. Omitted on the four tab screens: they are
	 * destinations, not somewhere you drill into, and the tab bar is already the
	 * way between them. Already-resolved, because it crosses the load boundary
	 * as a plain string.
	 */
	back?: string | null;
	/**
	 * Puts the light/dark toggle at the end of the title row. Only Gear sets it:
	 * the theme is a set-once preference, and it belongs with the app's other
	 * settings rather than in the corner of every screen.
	 */
	themeToggle?: boolean;
};
