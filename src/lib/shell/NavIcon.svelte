<script lang="ts">
	import type { Destination } from './nav';

	/**
	 * Line glyphs for the desktop rail. Stroked rather than filled so they sit at
	 * the same visual weight as the label next to them, which a solid shape at
	 * this size does not.
	 */
	type Props = { name: Destination['icon']; size?: number };
	let { name, size = 18 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'today'}
		<!-- A calendar: what today is. -->
		<rect x="3" y="5" width="18" height="16" rx="4" />
		<path d="M8 3v4M16 3v4M3 10h18" />
	{:else if name === 'routine'}
		<!-- A list: the split, day after day. -->
		<path d="M4 7h16M4 12h16M4 17h10" />
	{:else if name === 'history'}
		<!-- A rising line over an axis: what the numbers have been doing. -->
		<path d="M4 4v16h16" />
		<path d="M7 15l4-5 3 3 5-6" />
	{:else}
		<!-- Sliders: the gym's own settings, not the app's. -->
		<path d="M4 8h9M19 8h1M4 16h3M13 16h7" />
		<circle cx="16" cy="8" r="2.4" />
		<circle cx="10" cy="16" r="2.4" />
	{/if}
</svg>
