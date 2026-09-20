<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SessionSummary } from '$lib/server/sessions';
	import { TOOL_SPEC } from '$lib/types';
	import { formatVolume, formatWeight, isUnloaded, wholeMinutes } from '$lib/volume';

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
	 * Three figures in three cards, the same anatomy as the home screen's month:
	 * a colored cap, the number, the unit under it. Sets first — it is the one
	 * figure that says what you actually did, and it is the only one that is
	 * exactly right rather than derived from the weights you typed.
	 *
	 * The unit lives in the label rather than beside the number, so the number
	 * gets the whole width of its card. "min" stays abbreviated because it has to
	 * read the same under a 1 as under a 47.
	 */
	const stats = $derived([
		{ label: 'sets', value: String(summary.setCount) },
		{ label: 'lb lifted', value: formatVolume(summary.volume) },
		{ label: 'min', value: String(wholeMinutes(summary.durationMins)) }
	]);

	/*
	 * Each movement's line, and the one figure it is worth ending on.
	 *
	 * A loaded movement ends on the weight it moved. An unloaded one — pull-ups,
	 * dips — moved nothing the app can weigh, and printing "0 lb" against thirty
	 * pull-ups reads as the app having failed to count them. So it ends on the
	 * reps instead, and the line in front of it says what the load was rather
	 * than repeating a rep count that has moved to the end.
	 */
	const movementRows = $derived(
		summary.rows.map((row) => {
			const unloaded = isUnloaded(row);
			return {
				...row,
				detail: unloaded
					? `${row.sets} sets · ${TOOL_SPEC[row.tool].label.toLowerCase()}`
					: `${row.sets} × ${formatWeight(row.weight)} lb · ${row.reps} reps`,
				total: unloaded ? `${row.reps} reps` : `${formatVolume(row.volume)} lb`
			};
		})
	);

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
		{#each stats as stat, i (stat.label)}
			<li class="stat">
				<span class="cap" data-cap={i}></span>
				<span class="stat-value num">{stat.value}</span>
				<span class="stat-label">{stat.label}</span>
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
		{#each movementRows as row (row.movementId)}
			<li class="row">
				<span class="row-name">{row.name}</span>
				<span class="row-detail num">{row.detail}</span>
				<span class="row-volume num">{row.total}</span>
			</li>
		{/each}
	</ul>

	<div class="actions">
		<a class="btn btn-secondary" href={resolve('/')}>Back to my days</a>
		{#if summary.dayId}
			<a class="btn btn-primary update" href={resolve('/routine/[id]', { id: summary.dayId })}>
				Update routine
			</a>
		{/if}
	</div>
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
	 * row's heading in all but name, so it sits the same distance from those cards
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
	/* Three cards rather than three columns of one, so the summary's figures and
	   the home screen's month are the same object read in two places. Flex with
	   `flex: 1` keeps them equal without the tracks a grid would impose: each card
	   is its own box, and a five-figure volume shrinks its own type rather than
	   widening a column that the other two then have to match. */
	.stats {
		display: flex;
		gap: 8px;
		margin-bottom: 30px;
	}
	.stat {
		flex: 1;
		min-width: 0;
		padding: 14px;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}
	/* A short colored cap above each figure, so three identical cards are still
	   distinguishable at a glance. The home screen's colors, in its order. */
	.cap {
		display: block;
		width: 18px;
		height: 3px;
		border-radius: var(--radius-pill);
		margin-bottom: 9px;
	}
	.cap[data-cap='0'] {
		background: var(--color-accent-500);
	}
	.cap[data-cap='1'] {
		background: var(--color-accent-2-500);
	}
	.cap[data-cap='2'] {
		background: var(--color-neutral-500);
	}
	/* The home screen's 21px, but allowed to shrink: this screen prints a real
	   session's volume, which runs to five figures in a card a third of a phone
	   wide, where the month's average does not. */
	.stat-value {
		display: block;
		font-family: var(--font-heading);
		font-size: clamp(17px, 5.4vw, 21px);
		line-height: 1.2;
		white-space: nowrap;
	}
	.stat-label {
		display: block;
		font-size: 11.5px;
		color: var(--color-neutral-500);
		margin-top: 1px;
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

	/*
	 * The two things worth doing having just finished: leave, or go and set next
	 * week's targets while the session is still in your head. The accent is on
	 * the routine, because leaving is what happens anyway. They wrap rather than
	 * shrink, since "Update routine" is the longer label and truncating the way
	 * out of the screen would be the wrong trade.
	 */
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 26px;
	}
	.actions .btn {
		text-decoration: none;
	}
	/* `margin-left: auto` rather than `justify-content: space-between`, so it is
	   still pushed to the right edge on the narrow phone where the two wrap onto
	   separate lines. */
	.update {
		margin-left: auto;
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
