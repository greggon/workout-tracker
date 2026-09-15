<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatMinutes, formatVolume, relativeDay } from '$lib/volume';

	let { data } = $props();

	const nextKey = $derived(data.days[0]?.key ?? null);

	const subtitle = $derived.by(() => {
		if (data.days.length === 0) return 'No days in your routine yet.';
		if (!data.lastKey || data.lastAt === null) {
			return `${data.splitSize}-day rotation, nothing logged yet. Start wherever you like.`;
		}
		return `Next up is ${nextKey} day. ${data.splitSize}-day rotation, and you last finished ${data.lastKey} day ${relativeDay(data.lastAt)}.`;
	});

	const stats = $derived([
		{
			label: 'Sessions logged',
			value: String(data.stats.sessionCount),
			note: `across ${data.splitSize} day types`
		},
		{
			label: `Last ${data.stats.sampleSize || 4} avg volume`,
			value: `${formatVolume(data.stats.avgVolume)} lb`,
			note: 'weight moved per session'
		},
		{
			label: 'Avg session',
			value: data.stats.avgMins ? formatMinutes(data.stats.avgMins) : '—',
			note: 'door to door'
		}
	]);
</script>

<svelte:head>
	<title>Workout</title>
</svelte:head>

<div class="head">
	<h2>My days</h2>
	<a class="btn btn-ghost" href={resolve('/routine')}>Edit routine</a>
</div>
<p class="text-muted sub">{subtitle}</p>

{#if data.days.length === 0}
	<div class="card elev-sm empty">
		<div class="card-title">Nothing to train yet</div>
		<p class="text-muted">Build a split and add some movements to get started.</p>
		<a class="btn btn-primary" href={resolve('/routine')}>Set up my routine</a>
	</div>
{:else}
	<ul class="days">
		{#each data.days as day, i (day.id)}
			{@const isNext = i === 0}
			<li class="day" class:next={isNext}>
				<a class="day-main" href={resolve('/')}>
					<span class="badge" class:badge-next={isNext}>{day.key}</span>
					<span class="day-text">
						<span class="day-title-row">
							<span class="day-title">{day.title}</span>
							{#if isNext}
								<span class="tag tag-accent">Up next</span>
							{:else if day.lastAt}
								<span class="tag ago">{relativeDay(day.lastAt)}</span>
							{:else}
								<span class="tag ago">new</span>
							{/if}
						</span>
						<span class="day-meta num">
							{day.exerciseCount} exercises · {day.sets} sets · {formatVolume(day.volume)} lb planned
						</span>
					</span>
				</a>
				{#if day.chips.length}
					<ul class="chips">
						{#each day.chips as chip, ci (ci)}
							<li class="chip">{chip}</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>

	<ul class="stats">
		{#each stats as stat (stat.label)}
			<li class="stat">
				<div class="stat-label">{stat.label}</div>
				<div class="stat-value num">{stat.value}</div>
				<div class="stat-note">{stat.note}</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding-top: 22px;
	}
	h2 {
		font-size: 30px;
		letter-spacing: -0.025em;
		margin: 0 auto 0 0;
	}
	.sub {
		max-width: 46ch;
		margin: 0 0 30px;
		font-size: 15px;
	}

	.days,
	.chips,
	.stats {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.days {
		display: grid;
		gap: 12px;
		margin-bottom: 34px;
	}
	.day {
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	/* The next day up is the one thing on this screen you act on, so it is the
	   only card that carries the accent ring. */
	.day.next {
		box-shadow:
			inset 0 0 0 1px var(--color-accent-700),
			0 6px 18px rgba(0, 0, 0, 0.4);
	}

	.day-main {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 18px;
		color: inherit;
		text-decoration: none;
	}

	.badge {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		font-family: var(--font-heading);
		font-size: 16px;
		color: var(--color-neutral-300);
		background: var(--color-neutral-900);
	}
	.badge-next {
		color: var(--color-accent-200);
		background: var(--color-accent-800);
		box-shadow: inset 0 0 0 1px var(--color-accent-600);
	}

	.day-text {
		min-width: 0;
		flex: 1;
	}
	.day-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.day-title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 19px;
		letter-spacing: -0.015em;
	}
	.day-meta {
		display: block;
		font-size: 12.5px;
		color: var(--color-neutral-500);
		margin-top: 3px;
	}
	.tag.ago {
		font-size: 11px;
		padding: 2px 8px;
		color: var(--color-neutral-500);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0 18px 14px 70px;
	}
	.chip {
		font-size: 11.5px;
		color: var(--color-neutral-400);
		background: var(--color-neutral-900);
		border-radius: 5px;
		padding: 3px 8px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 14px;
	}
	.stat-label {
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.stat-value {
		font-family: var(--font-heading);
		font-size: 26px;
		line-height: 1.15;
	}
	.stat-note {
		font-size: 11.5px;
		color: var(--color-neutral-500);
	}

	.empty {
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-6);
	}

	@media (max-width: 480px) {
		.chips {
			padding-left: 18px;
		}
	}
</style>
