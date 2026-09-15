<script lang="ts">
	import { describeLoading, loadingLabel, type LoadingConfig } from '$lib/plates';
	import type { Tool } from '$lib/types';

	type Props = { tool: Tool; weight: number; config: LoadingConfig };
	let { tool, weight, config }: Props = $props();

	const W = 120;
	const H = 43;
	/** Vertical centre of the bar. */
	const AXIS = 21.5;

	const loading = $derived(describeLoading(tool, weight, config));
	const label = $derived(loadingLabel(tool, weight, config));

	/** Plate thickness and height scale with denomination. */
	function size(p: number) {
		return { h: 10 + p * 0.62, w: p >= 35 ? 6 : p >= 10 ? 5 : 3.5 };
	}

	/**
	 * Lays plates outward from a collar. A two-sleeve bar mirrors the same stack
	 * on both sides; a landmine or machine loads one end, so only the right-hand
	 * run is drawn and the other end sits bare.
	 */
	function sleeve(plates: number[], sleeves: number) {
		const out: { x: number; y: number; w: number; h: number }[] = [];
		let lx = 44;
		let rx = 76;
		for (const p of plates) {
			const { h, w } = size(p);
			out.push({ x: rx, y: AXIS - h / 2, w, h });
			rx += w + 1.5;
			if (sleeves === 2) {
				out.push({ x: lx - w, y: AXIS - h / 2, w, h });
				lx -= w + 1.5;
			}
		}
		return out;
	}

	const drawn = $derived(loading.kind === 'loaded' ? sleeve(loading.plates, loading.sleeves) : []);
	const short = $derived(loading.kind === 'loaded' && loading.remainder > 0);
</script>

<svg
	viewBox="0 0 {W} {H}"
	width={W}
	height={H}
	role="img"
	aria-label={label}
	class="diagram"
	class:short
>
	{#if loading.kind === 'bodyweight'}
		<!-- Nothing to load: a figure, not an implement. -->
		<circle class="ink" cx="60" cy="10" r="5" />
		<path class="stroke" d="M60 15 v13 M60 19 l-9 -5 M60 19 l9 -5 M60 28 l-7 11 M60 28 l7 11" />
		{#if loading.added > 0}
			<rect class="plate" x="52" y="20" width="16" height="6" rx="1.5" />
		{/if}
	{:else if loading.kind === 'fixed'}
		<!-- A fixed dumbbell: one solid object, nothing to hang. -->
		<rect class="ink" x="52" y="20" width="16" height="3" rx="1.5" />
		<rect class="plate" x="42" y="12" width="10" height="19" rx="2" />
		<rect class="plate" x="68" y="12" width="10" height="19" rx="2" />
	{:else}
		<rect class="ink" x="6" y="20" width="108" height="3" rx="1.5" />
		<rect class="ink" x="72" y="16" width="4" height="11" rx="1.5" />
		{#if loading.sleeves === 2}
			<rect class="ink" x="44" y="16" width="4" height="11" rx="1.5" />
		{/if}
		{#each drawn as p, i (i)}
			<rect class="plate" x={p.x} y={p.y} width={p.w} height={p.h} rx="1.5" />
		{/each}
	{/if}
</svg>

<style>
	.diagram {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.ink {
		fill: var(--color-neutral-400);
	}
	.stroke {
		fill: none;
		stroke: var(--color-neutral-400);
		stroke-width: 2;
		stroke-linecap: round;
	}
	.plate {
		fill: var(--color-accent-500);
	}
	/* A load the plates cannot actually make is drawn in outline, so the
	   diagram itself says "this is not what you will end up with". */
	.short .plate {
		fill: none;
		stroke: var(--color-accent-500);
		stroke-width: 1;
	}
</style>
