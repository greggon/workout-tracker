<script lang="ts">
	import LineChart from '$lib/charts/LineChart.svelte';
	import { TOOL_LABELS } from '$lib/types';
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

<div class="head">
	<div>
		<div class="kicker">
			{history.tool ? TOOL_LABELS[history.tool] : 'Movement'} · {history.totalSessions} session{history.totalSessions ===
			1
				? ''
				: 's'}
		</div>
		<h2>{history.name}</h2>
	</div>
	<a class="btn btn-ghost" href={data.back}>Back</a>
</div>

{#if history.best}
	<p class="text-muted sub">
		Heaviest set {formatWeight(history.best.weight)} lb × {history.best.reps}, {relativeDay(
			history.best.at
		)}.{trend ? ` ${trend}` : ''}
	</p>
{:else}
	<p class="text-muted sub">Nothing logged for this movement yet.</p>
{/if}

<h6 class="section">Working weight</h6>
<div class="chart-card">
	<LineChart
		{points}
		summary="Working weight for {history.name} over the last {points.length} sessions"
	/>
</div>

<h6 class="section">History</h6>
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
	.head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding-top: 22px;
	}
	.head > div:first-child {
		flex: 1;
		min-width: 0;
	}
	.kicker {
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 4px;
	}
	h2 {
		font-size: 30px;
		letter-spacing: -0.025em;
		margin: 0;
	}
	.sub {
		max-width: 52ch;
		margin: 10px 0 24px;
		font-size: 14.5px;
	}
	.section {
		color: var(--color-neutral-500);
		margin: 26px 0 10px;
	}
	.chart-card {
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 18px 14px 8px;
	}
	.table-wrap {
		overflow-x: auto;
	}
	.right {
		text-align: right;
	}
</style>
