/**
 * A "come back here afterwards" path taken from a query string or a form.
 *
 * Only a path on this site is accepted. The value ends up in an href or a
 * redirect, and "//evil.example" or "https://…" in a parameter is how a back
 * link becomes someone else's site. Anything else falls back.
 */
export function safeBack(requested: unknown, fallback: string): string {
	return typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
		? requested
		: fallback;
}
