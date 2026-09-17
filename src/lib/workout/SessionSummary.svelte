<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SessionSummary } from '$lib/server/sessions';
	import { formatMinutes, formatVolume, formatWeight } from '$lib/volume';

	type Props = {
		summary: SessionSummary;
		/** Set when the session could not be stored, so the screen can say so. */
		syncError?: string | null;
	};

	let { summary, syncError = null }: Props = $props();

	const delta = $derived(
		summary.previousVolume === null ? null : summary.volume - summary.previousVolume
	);

	const headline = $derived(
		delta === null
			? 'First one logged for this day.'
			: delta > 0
				? `Up ${formatVolume(delta)} lb on last time.`
				: delta < 0
					? `Down ${formatVolume(-delta)} lb on last time.`
					: 'Level with last time.'
	);

	/*
	 * Three figures, one row. No notes under them: the volume's read "Up 320 lb
	 * on last time", which is the headline printed directly above this, and the
	 * other two were decoration that cost the row its width on a phone.
	 */
	const stats = $derived([
		{ label: 'Volume', value: `${formatVolume(summary.volume)} lb` },
		{ label: 'Time', value: formatMinutes(summary.durationMins) },
		{ label: 'Sets', value: String(summary.setCount) }
	]);

	// --- volume chart -------------------------------------------------------
	const W = 460;
	const H = 130;
	const PAD = 22;
	const GAP = 12;

	/** Headroom so the tallest bar's label is not clipped by the viewBox. */
	const scaleMax = $derived(Math.max(...summary.history.map((h) => h.volume), 1) * 1.12);
	const barWidth = $derived(
		(W - PAD * 2 - GAP * (summary.history.length - 1)) / Math.max(1, summary.history.length)
	);

	const bars = $derived(
		summary.history.map((point, i) => {
			const height = Math.max(3, (point.volume / scaleMax) * (H - PAD * 2));
			return {
				...point,
				x: PAD + i * (barWidth + GAP),
				y: H - PAD - height,
				height,
				label: point.current
					? 'today'
					: new Date(point.startedAt).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric'
						})
			};
		})
	);
</script>

<section>
	<div class="kicker">{summary.dayKey} day complete</div>
	<h2>{summary.dayTitle}</h2>
	<p class="text-muted sub">{headline}</p>

	{#if syncError}
		<p class="notice" role="alert">{syncError}</p>
	{/if}

	<ul class="stats">
		{#each stats as stat (stat.label)}
			<li>
				<div class="stat-label">{stat.label}</div>
				<div class="stat-value num">{stat.value}</div>
			</li>
		{/each}
	</ul>

	<h6 class="section">Volume · last {summary.history.length - 1} {summary.dayKey} days + today</h6>
	<div class="chart">
		<svg
			viewBox="0 0 {W} {H}"
			role="img"
			aria-label="Volume over the last {summary.history.length} {summary.dayKey} days"
		>
			{#each bars as bar (bar.startedAt)}
				<rect
					x={bar.x}
					y={bar.y}
					width={barWidth}
					height={bar.height}
					rx="3"
					class={bar.current ? 'bar-now' : 'bar'}
				/>
				<text
					x={bar.x + barWidth / 2}
					y={bar.y - 6}
					text-anchor="middle"
					class={bar.current ? 'value-now' : 'value'}>{formatVolume(bar.volume)}</text
				>
				<text x={bar.x + barWidth / 2} y={H - 6} text-anchor="middle" class="axis">{bar.label}</text
				>
			{/each}
		</svg>
	</div>

	<h6 class="section">Per movement</h6>
	<ul class="rows card-list">
		{#each summary.rows as row (row.movementId)}
			<li class="row">
				<span class="row-name">{row.name}</span>
				<span class="row-detail num">
					{row.sets} × {formatWeight(row.weight)} lb · {row.reps} reps
				</span>
				<span class="row-volume num">{formatVolume(row.volume)} lb</span>
			</li>
		{/each}
	</ul>

	<a class="btn btn-primary back" href={resolve('/')}>Back to my days</a>
</section>

<style>
	section {
		padding-top: 30px;
	}
	.kicker {
		font-size: 9.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 6px;
	}
	h2 {
		font-size: 40px;
		letter-spacing: -0.03em;
		margin: 0 0 8px;
	}
	/*
	 * One rhythm down the page: 10px between a line of type and the card it
	 * introduces, 30px between one section and the next. This line is the stats
	 * card's heading in all but name, so it sits the same distance from its card
	 * as "Volume · last 4 B days" does from the chart.
	 */
	.sub {
		max-width: 48ch;
		margin: 0 0 10px;
	}
	.notice {
		font-size: 13px;
		color: var(--color-accent-200);
		background: var(--color-accent-900);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		margin-bottom: 10px;
		max-width: 56ch;
	}

	.stats,
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* One card, three equal columns — three figures that are read together, so
	   they sit together. Fixed columns rather than auto-fit: these never wrap to
	   a second row, however narrow the phone. */
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin-bottom: 30px;
		padding: 14px 16px 15px;
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}
	.stats > li {
		min-width: 0;
	}
	.stat-label {
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	/* Sized to the column so a five-figure volume still fits beside the other
	   two on the narrowest phone. */
	.stat-value {
		font-family: var(--font-heading);
		font-size: clamp(17px, 6vw, 27px);
		line-height: 1.15;
	}

	.section {
		color: var(--color-neutral-500);
		margin: 0 0 10px;
	}
	.chart {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: 12px 8px 4px;
		margin-bottom: 30px;
	}
	.chart svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.bar {
		fill: var(--color-accent-800);
	}
	.bar-now {
		fill: var(--color-accent);
	}
	.value,
	.value-now,
	.axis {
		font-family: var(--font-body);
		font-variant-numeric: tabular-nums;
	}
	.value {
		font-size: 10px;
		fill: var(--color-neutral-400);
	}
	.value-now {
		font-size: 10px;
		fill: var(--color-accent-200);
	}
	.axis {
		font-size: 9.5px;
		fill: var(--color-neutral-600);
	}

	/* The per-movement list, on the card surface. The heading stays outside it,
	   the way every other section on the home screen reads. */
	.card-list {
		padding: 2px 16px;
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}
	.row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-divider);
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row-name {
		flex: 1 1 40%;
		min-width: 0;
		font-size: 14px;
	}
	.row-detail {
		flex: 1 1 auto;
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}
	.row-volume {
		flex: none;
		font-size: 12.5px;
		color: var(--color-accent-300);
	}

	.back {
		margin-top: 26px;
		text-decoration: none;
	}

	@media (max-width: 480px) {
		.row {
			flex-wrap: wrap;
		}
		.row-name {
			flex-basis: 100%;
		}
		.row-volume {
			margin-left: auto;
		}
	}
</style>
