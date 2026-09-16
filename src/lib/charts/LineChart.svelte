<script lang="ts">
	type Point = { value: number; label: string; caption: string };

	type Props = {
		points: Point[];
		/** Read out to screen readers in place of the drawing. */
		summary: string;
	};

	let { points, summary }: Props = $props();

	const W = 460;
	const H = 120;
	const PAD = 26;

	/**
	 * The scale is padded on both sides rather than anchored at zero: a lifter
	 * cares about the shape of 225 → 230 → 235, and a zero baseline flattens
	 * that into a straight line. The value labels keep it honest.
	 */
	const bounds = $derived.by(() => {
		const values = points.map((p) => p.value);
		const high = Math.max(...values, 1) * 1.08;
		const low = Math.min(...values) * 0.92;
		return { high, low: high === low ? low - 1 : low };
	});

	/* Plain functions: they read reactive state when called, so wrapping them in
	   $derived rebuilt the closure on every change without memoising anything. */
	const x = (i: number) =>
		points.length < 2 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1);
	const y = (value: number) =>
		H - PAD - ((value - bounds.low) / (bounds.high - bounds.low)) * (H - PAD * 2);

	const plotted = $derived(points.map((p, i) => ({ ...p, cx: x(i), cy: y(p.value) })));

	const line = $derived(
		plotted.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`).join(' ')
	);
	const area = $derived(
		plotted.length === 0
			? ''
			: `${line} L${plotted[plotted.length - 1].cx.toFixed(1)} ${H - PAD} L${plotted[0].cx.toFixed(1)} ${H - PAD} Z`
	);
</script>

{#if points.length === 0}
	<p class="empty text-muted">Nothing logged yet.</p>
{:else}
	<svg viewBox="0 0 {W} {H}" role="img" aria-label={summary} class="chart">
		<path d={area} class="area" />
		<path d={line} class="line" />
		{#each plotted as point, i (i)}
			<circle cx={point.cx} cy={point.cy} r="3.5" class="dot" />
			<text x={point.cx} y={point.cy - 10} text-anchor="middle" class="value">{point.caption}</text>
			<text x={point.cx} y={H - 8} text-anchor="middle" class="axis">{point.label}</text>
		{/each}
	</svg>
{/if}

<style>
	.chart {
		display: block;
		width: 100%;
		height: auto;
		/* The topmost value label sits above its dot and outside the plot. */
		overflow: visible;
	}
	.area {
		fill: var(--color-accent-900);
		opacity: 0.8;
	}
	.line {
		fill: none;
		stroke: var(--color-accent);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.dot {
		fill: var(--color-bg);
		stroke: var(--color-accent);
		stroke-width: 2;
	}
	.value,
	.axis {
		font-family: var(--font-body);
		font-variant-numeric: tabular-nums;
	}
	.value {
		font-size: 10px;
		fill: var(--color-neutral-300);
	}
	.axis {
		font-size: 9.5px;
		fill: var(--color-neutral-600);
	}
	.empty {
		font-size: 13px;
		margin: 0;
	}
</style>
