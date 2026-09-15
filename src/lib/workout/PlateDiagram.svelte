<script lang="ts">
	import { describeLoading, loadingLabel, plateColors, type LoadingConfig } from '$lib/plates';
	import { DEFAULT_PLATE_COLOR, type Tool } from '$lib/types';
	import { MAX_GLYPH_HEIGHT, plateGlyph } from './plate-glyph';

	type Props = { tool: Tool; weight: number; config: LoadingConfig };
	let { tool, weight, config }: Props = $props();

	/**
	 * One sleeve, drawn large.
	 *
	 * A barbell and a pulley load symmetrically, so mirroring the stack told you
	 * nothing the label did not already say ("per side") while costing half the
	 * width. Showing a single sleeve spends that width on plates big enough to
	 * tell apart at arm's length, mid-set.
	 */

	/** Tall enough for the heaviest plate, with a little air above and below. */
	const H = MAX_GLYPH_HEIGHT + 6;
	/** Vertical centre of the shaft. */
	const AXIS = H / 2;
	/** Where the first plate sits, just past the collar. */
	const FIRST = 50;
	const GAP = 2;
	/** Keeps a light load from rendering as a tiny drawing. */
	const MIN_W = 170;

	const loading = $derived(describeLoading(tool, weight, config));
	const label = $derived(loadingLabel(tool, weight, config));
	const colors = $derived(plateColors(config.inventory));

	const stack = $derived.by(() => {
		if (loading.kind !== 'loaded') return [];
		const out: { x: number; y: number; w: number; h: number; fill: string }[] = [];
		let x = FIRST;
		for (const p of loading.plates) {
			const { h, w } = plateGlyph(p);
			out.push({ x, y: AXIS - h / 2, w, h, fill: colors.get(p) ?? DEFAULT_PLATE_COLOR });
			x += w + GAP;
		}
		return out;
	});

	/** Grows if a load needs more room than the base width, rather than clipping. */
	const W = $derived(
		stack.length === 0
			? MIN_W
			: Math.max(MIN_W, stack[stack.length - 1].x + stack[stack.length - 1].w + 12)
	);

	const short = $derived(loading.kind === 'loaded' && loading.remainder > 0);
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} class="diagram" class:short>
	{#if loading.kind === 'bodyweight'}
		<!-- Nothing to load: a figure, not an implement. -->
		<circle class="ink" cx={W / 2} cy="13" r="7" />
		<path
			class="stroke"
			d="M{W / 2} 21 v18 M{W / 2} 26 l-12 -6 M{W / 2} 26 l12 -6 M{W / 2} 39 l-9 15 M{W /
				2} 39 l9 15"
		/>
		{#if loading.added > 0}
			<rect class="plate" x={W / 2 - 13} y="27" width="26" height="9" rx="2" />
		{/if}
	{:else if loading.kind === 'fixed'}
		<!-- A fixed dumbbell: one solid object, nothing to hang. -->
		<rect class="ink" x={W / 2 - 14} y={AXIS - 3} width="28" height="6" rx="3" />
		<rect class="plate fixed-bell" x={W / 2 - 30} y={AXIS - 17} width="16" height="34" rx="4" />
		<rect class="plate fixed-bell" x={W / 2 + 14} y={AXIS - 17} width="16" height="34" rx="4" />
	{:else}
		<!-- The shaft runs off the left edge: what you see is the loading end. -->
		<rect class="ink" x="0" y={AXIS - 3} width="46" height="6" rx="3" />
		<rect class="ink" x="41" y={AXIS - 12} width="6" height="24" rx="2" />
		{#each stack as plate, i (i)}
			<!--
				The colour goes in as a custom property, not a `fill` attribute.
				An SVG presentation attribute loses to any CSS rule, so the
				`.plate` rule below would quietly override every per-plate fill.
			-->
			<rect
				class="plate"
				style:--plate-fill={plate.fill}
				x={plate.x}
				y={plate.y}
				width={plate.w}
				height={plate.h}
				rx="2"
			/>
		{/each}
	{/if}
</svg>

<style>
	.diagram {
		display: block;
		width: 100%;
		max-width: 190px;
		height: auto;
		--plate-edge: color-mix(in srgb, var(--color-text) 55%, transparent);
	}
	.ink {
		fill: var(--color-neutral-400);
	}
	.stroke {
		fill: none;
		stroke: var(--color-neutral-400);
		stroke-width: 3;
		stroke-linecap: round;
	}
	/*
	 * Every plate carries a hairline edge. Without it a black plate — the
	 * default, and what most iron actually is — disappears against the dark
	 * theme's near-black ground.
	 *
	 * The fill comes from --plate-fill, set per rect. Shapes with no plate
	 * behind them (the bodyweight belt, the fixed dumbbell) set nothing and
	 * fall back to the accent.
	 */
	.plate {
		fill: var(--plate-fill, var(--color-accent-500));
		stroke: var(--plate-edge);
		stroke-width: 0.8;
	}
	.fixed-bell {
		fill: var(--color-accent-500);
		stroke: none;
	}
	/* A load the plates cannot actually make is drawn in outline, so the
	   diagram itself says "this is not what you will end up with". The accent
	   is used rather than the plate's own colour: a black outline would be the
	   one state you cannot see. */
	.short .plate {
		fill: none;
		stroke: var(--color-accent-500);
		stroke-width: 1.4;
	}
</style>
