<script lang="ts">
	import LineChart from '$lib/charts/LineChart.svelte';
	import { formatVolume, formatWeight, relativeDay } from '$lib/volume';

	let { data } = $props();

	const history = $derived(data.history);

	const dayLabel = (at: number) =>
		new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

	const points = $derived(
		history.entries.map((e) => ({
			value: e.weight,
			label: dayLabel(e.at),
			caption: formatWeight(e.weight)
		}))
	);

	/** Newest first in the table; the chart runs the other way. */
	const rows = $derived([...history.entries].reverse());

	const trend = $derived.by(() => {
		if (history.entries.length < 2) return null;
		const first = history.entries[0].weight;
		const last = history.entries[history.entries.length - 1].weight;
		const diff = last - first;
		if (diff === 0) return `Same load as ${relativeDay(history.entries[0].at)}.`;
		const word = diff > 0 ? 'Up' : 'Down';
		return `${word} ${formatWeight(Math.abs(diff))} lb since ${relativeDay(history.entries[0].at)}.`;
	});
</script>

<svelte:head>
	<title>{history.name}</title>
</svelte:head>

{#if history.best}
	<p class="text-muted sub">
		Heaviest set {formatWeight(history.best.weight)} lb × {history.best.reps}, {relativeDay(
			history.best.at
		)}.{trend ? ` ${trend}` : ''}
	</p>
{:else}
	<p class="text-muted sub">Nothing logged for this movement yet.</p>
{/if}

<h2 class="section-label">Working weight</h2>
<div class="chart-card">
	<LineChart
		{points}
		summary="Working weight for {history.name} over the last {points.length} sessions"
	/>
</div>

<h2 class="section-label">Sessions</h2>
<div class="table-wrap">
	<table class="table">
		<thead>
			<tr>
				<th>Date</th>
				<th class="right">Weight</th>
				<th class="right">Top set</th>
				<th class="right">Volume</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.sessionId)}
				<tr>
					<td>{dayLabel(row.at)}</td>
					<td class="right num">{formatWeight(row.weight)} lb</td>
					<td class="right num">{row.topSet} × {row.sets}</td>
					<td class="right num">{formatVolume(row.volume)} lb</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="text-muted">No sessions yet.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* The intro line every screen opens with: body size, straight under the
	   shell's padding, the section heading's 28px after it. */
	.sub {
		max-width: 52ch;
		margin: 0;
	}
	.chart-card {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: 18px 14px 8px;
	}
	/* The table on the same surface as the chart above it: two readings of the
	   same history, so they should look like two of the same thing. The rounded
	   corners clip the horizontal scroll, which is what keeps a wide table from
	   poking out of the card on a narrow phone. */
	.table-wrap {
		overflow-x: auto;
		padding: 2px 14px;
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}
	.right {
		text-align: right;
	}
</style>
