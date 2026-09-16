<script lang="ts">
	import { describeLoading, loadingLabel, plateColors, type LoadingConfig } from '$lib/plates';
	import { DEFAULT_PLATE_COLOR, type Tool } from '$lib/types';
	import { inkOn, MAX_GLYPH_HEIGHT, plateGlyph, plateLabel, plateText } from './plate-glyph';

	type Props = { tool: Tool; weight: number; config: LoadingConfig };
	let { tool, weight, config }: Props = $props();

	/**
	 * One sleeve, drawn large, with every plate carrying its own number.
	 *
	 * A barbell and a pulley load symmetrically, so mirroring the stack told you
	 * nothing the label did not already say ("per side") while costing half the
	 * width. Showing a single sleeve spends that width on plates big enough to
	 * read at arm's length, mid-set — which is also what makes room for the
	 * weights to be written on them rather than inferred from their size.
	 *
	 * The shaft runs off the left edge, toward the middle of the bar. Plates load
	 * outward from there, heaviest first, and the bar's own weight is written on
	 * the sleeve beyond them.
	 */

	/**
	 * Tall enough for the heaviest plate, with a little air above and below.
	 *
	 * Kept tight on purpose: the drawing is rendered small, so every unit of
	 * padding in here is a unit not spent on a number the lifter has to read.
	 */
	const H = MAX_GLYPH_HEIGHT + 10;
	/** Vertical centre of the shaft. */
	const AXIS = H / 2;
	const SHAFT_H = 11;
	/** Where the first plate sits, just past the collar. */
	const FIRST = 34;
	const GAP = 3;
	/** Room beyond the last plate for the sleeve and the bar's own weight. */
	const SLEEVE = 56;
	/** Keeps a light load from rendering as a tiny drawing. */
	const MIN_W = 250;

	const loading = $derived(describeLoading(tool, weight, config));
	const label = $derived(loadingLabel(tool, weight, config));
	const colors = $derived(plateColors(config.inventory));
	/* describeLoading already worked this out; asking plates.ts a second time
	   would be a second place for "what does this implement weigh" to live. */
	const barWeight = $derived(loading.kind === 'loaded' ? loading.base : 0);

	const short = $derived(loading.kind === 'loaded' && loading.remainder > 0);

	const stack = $derived.by(() => {
		if (loading.kind !== 'loaded') return [];
		let x = FIRST;
		return loading.plates.map((p) => {
			const { h, w } = plateGlyph(p);
			const fill = colors.get(p) ?? DEFAULT_PLATE_COLOR;
			const text = plateText(p, { h, w });
			const plate = {
				x,
				y: AXIS - h / 2,
				w,
				h,
				fill,
				cx: x + w / 2,
				ink: short ? 'var(--color-accent-500)' : inkOn(fill),
				...text
			};
			x += w + GAP;
			return plate;
		});
	});

	/** Grows if a load needs more room than the base width, rather than clipping. */
	const W = $derived(
		stack.length === 0
			? MIN_W
			: Math.max(MIN_W, stack[stack.length - 1].x + stack[stack.length - 1].w + SLEEVE)
	);

	/** Where the bar's weight is written: the clear run past the last plate. */
	const barLabelX = $derived(
		stack.length === 0 ? W * 0.62 : (stack[stack.length - 1].x + stack[stack.length - 1].w + W) / 2
	);
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label={label} class="diagram" class:short>
	{#if loading.kind === 'bodyweight'}
		<!-- Nothing to load: a figure, not an implement. -->
		<circle class="ink" cx={W / 2} cy={AXIS - 46} r="15" />
		<path
			class="stroke"
			d="M{W / 2} {AXIS - 28} v38 M{W / 2} {AXIS - 18} l-26 -13 M{W / 2} {AXIS - 18} l26 -13 M{W /
				2} {AXIS + 10} l-19 32 M{W / 2} {AXIS + 10} l19 32"
		/>
		{#if loading.added > 0}
			<rect class="plate" x={W / 2 - 28} y={AXIS - 10} width="56" height="19" rx="4" />
		{/if}
	{:else if loading.kind === 'fixed'}
		<!-- A fixed dumbbell: one solid object, nothing to hang. -->
		<rect class="ink" x={W / 2 - 34} y={AXIS - 7} width="68" height="14" rx="7" />
		<rect class="plate fixed-bell" x={W / 2 - 72} y={AXIS - 40} width="38" height="80" rx="9" />
		<rect class="plate fixed-bell" x={W / 2 + 34} y={AXIS - 40} width="38" height="80" rx="9" />
		<text class="bar-weight" x={W / 2} y={AXIS} text-anchor="middle" dominant-baseline="central">
			{plateLabel(loading.weight)}
		</text>
	{:else}
		<!-- The shaft runs the full width: off the left edge toward the middle of
		     the bar, and out to the sleeve on the right. -->
		<rect class="ink" x="0" y={AXIS - SHAFT_H / 2} width={W} height={SHAFT_H} rx={SHAFT_H / 2} />
		<!-- The collar the plates sit against. -->
		<rect class="ink collar" x={FIRST - 12} y={AXIS - 22} width="10" height="44" rx="4" />

		{#if barWeight > 0}
			<!-- The bar's own weight, written where it is: on the bar. -->
			<text
				class="bar-weight"
				x={barLabelX}
				y={AXIS}
				text-anchor="middle"
				dominant-baseline="central">{plateLabel(barWeight)}</text
			>
		{/if}

		{#each stack as plate, i (i)}
			<!--
				The color goes in as a custom property, not a `fill` attribute. An SVG
				presentation attribute loses to any CSS rule, so the `.plate` rule
				below would quietly override every per-plate fill.
			-->
			<rect
				class="plate"
				style:--plate-fill={plate.fill}
				x={plate.x}
				y={plate.y}
				width={plate.w}
				height={plate.h}
				rx="5"
			/>
			{#each plate.lines as line, l (l)}
				<text
					class="plate-weight"
					x={plate.cx}
					y={AXIS + (l - (plate.lines.length - 1) / 2) * plate.lineHeight}
					font-size={plate.fontSize}
					fill={plate.ink}
					text-anchor="middle"
					dominant-baseline="central">{line}</text
				>
			{/each}
		{/each}
	{/if}
</svg>

<style>
	.diagram {
		display: block;
		width: 100%;
		height: auto;
		--plate-edge: color-mix(in srgb, var(--color-text) 55%, transparent);
	}
	.ink {
		fill: var(--color-neutral-400);
	}
	.collar {
		fill: var(--color-neutral-500);
	}
	.stroke {
		fill: none;
		stroke: var(--color-neutral-400);
		stroke-width: 5;
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
		stroke-width: 1;
	}
	.fixed-bell {
		fill: var(--color-accent-500);
		stroke: none;
	}
	/* Written on the plate, so it takes the ink that plate's color can carry —
	   chosen per plate rather than fixed, because the colors are the lifter's. */
	.plate-weight {
		font-family: var(--font-heading);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.bar-weight {
		font-family: var(--font-heading);
		font-weight: 600;
		font-size: 19px;
		fill: var(--color-neutral-500);
	}
	/* A load the plates cannot actually make is drawn in outline, so the diagram
	   itself says "this is not what you will end up with". The accent is used
	   rather than the plate's own color: a black outline would be the one state
	   you cannot see. */
	.short .plate {
		fill: none;
		stroke: var(--color-accent-500);
		stroke-width: 2;
	}
</style>
