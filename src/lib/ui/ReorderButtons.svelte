<script lang="ts">
	/**
	 * Move-earlier / move-later, as one control.
	 *
	 * The routine list and the day editor each drew their own: stacked 30×22
	 * chevrons in one, side-by-side ↑↓ text glyphs at 30×26 in the other, and
	 * both under the 44px touch target because their local size outranked the
	 * shared one. Explicit buttons rather than drag, because they work with a
	 * thumb, a keyboard and a screen reader alike.
	 */
	type Props = {
		/** What is being moved, for the labels: "Move Upper earlier". */
		name: string;
		first: boolean;
		last: boolean;
		onmove: (delta: -1 | 1) => void;
	};
	let { name, first, last, onmove }: Props = $props();
</script>

<div class="reorder">
	<button
		type="button"
		class="btn btn-secondary btn-icon"
		onclick={() => onmove(-1)}
		disabled={first}
		aria-label="Move {name} earlier"
	>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg
		>
	</button>
	<button
		type="button"
		class="btn btn-secondary btn-icon"
		onclick={() => onmove(1)}
		disabled={last}
		aria-label="Move {name} later"
	>
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg
		>
	</button>
</div>

<style>
	/* Two M3 outlined icon buttons; the shared classes supply size (40px, 48px
	   on touch), shape and state layer. */
	.reorder {
		flex: none;
		display: flex;
		gap: 4px;
	}
</style>
