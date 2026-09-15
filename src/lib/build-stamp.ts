/**
 * Formats the CI build timestamp for the footer.
 *
 * Pinned to UTC rather than the viewer's locale on purpose: this string is
 * rendered during SSR and again on hydration, and anything timezone-dependent
 * produces a mismatch between the two. CI stamps are UTC anyway, so the label
 * is honest as well as stable.
 *
 * Hand-formatted rather than run through Intl because ICU is not stable across
 * Node builds — `en-GB` abbreviates September to "Sept" while every other month
 * gets three letters, so the column width changes with the month. A fixed table
 * renders identically wherever it runs.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Returns the value unchanged when it is not a date — the Dockerfile defaults
 * BUILD_TIME to "unknown" and local dev has no value at all, and both read
 * better than "Invalid Date".
 */
export function formatBuildTime(value: string): string {
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;

	return (
		`${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
		`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
	);
}
