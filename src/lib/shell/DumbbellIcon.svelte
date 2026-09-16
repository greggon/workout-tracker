<script lang="ts">
	/**
	 * The app's own mark, as an inline glyph.
	 *
	 * Same geometry as static/icon.svg, minus the rounded-square ground and
	 * drawn in currentColor so it takes the color of whatever it sits on. The
	 * viewBox is cropped to the bar itself — the file version is padded to fill
	 * a launcher tile, which would leave this floating in dead space.
	 */
	type Props = { size?: number; class?: string };
	let { size = 28, class: className = '' }: Props = $props();

	/** The glyph spans x 76–436, y 188–324 in the icon's 512 box, plus padding. */
	const RATIO = 140 / 380;
</script>

<svg
	viewBox="66 186 380 140"
	width={size}
	height={Math.round(size * RATIO)}
	fill="currentColor"
	class={className}
	aria-hidden="true"
>
	<rect x="96" y="238" width="320" height="36" rx="18" />
	<rect x="140" y="188" width="44" height="136" rx="16" />
	<rect x="328" y="188" width="44" height="136" rx="16" />
	<rect x="76" y="212" width="32" height="88" rx="14" />
	<rect x="404" y="212" width="32" height="88" rx="14" />
</svg>
