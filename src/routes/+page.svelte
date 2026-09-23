<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatMinutes, formatVolume, relativeDay } from '$lib/volume';

	let { data } = $props();

	const upNext = $derived(data.days[0] ?? null);
	const later = $derived(data.days.slice(1));

	/** Thousands, because planned volume runs to five figures and the tile is narrow. */
	const thousands = (n: number) => `${Math.round(n / 100) / 10}k`;

	/** The day's size in one supporting line, the way an M3 card states it. */
	const summary = $derived(
		upNext
			? `${upNext.exerciseCount} exercises · ${upNext.sets} sets · ${thousands(upNext.volume)} lb`
			: ''
	);

	const stats = $derived([
		{ value: String(data.stats.sessionCount), label: 'sessions' },
		{ value: `${formatVolume(data.stats.avgVolume)}`, label: 'avg lb' },
		{ value: data.stats.avgMins ? formatMinutes(data.stats.avgMins) : '—', label: 'avg time' }
	]);
</script>

<svelte:head><title>Workout</title></svelte:head>

{#if !upNext}
	<div class="card">
		<div class="card-title">Nothing to train yet</div>
		<p class="text-muted">Build a split and add some movements to get started.</p>
		<a class="btn btn-primary btn-block" href={resolve('/routine')}>Set up my routine</a>
	</div>
{:else}
	<h2 class="section-label">This month</h2>
	<ul class="stats">
		{#each stats as stat (stat.label)}
			<li class="stat">
				<span class="stat-value num">{stat.value}</span>
				<span class="stat-label">{stat.label}</span>
			</li>
		{/each}
	</ul>

	<h2 class="section-label">Up next</h2>
	<!-- The thing to act on: a filled card with its heading on a primary strip. -->
	<section class="hero">
		<div class="hero-head">
			<span class="badge hero-badge">{upNext.key}</span>
			<span class="hero-text">
				<span class="hero-title">{upNext.title}</span>
				<span class="hero-meta num">{summary}</span>
			</span>
		</div>

		<div class="hero-body">
			<ul class="chips">
				{#each upNext.chips as chip, i (i)}
					<li class="chip">{chip}</li>
				{/each}
			</ul>

			<a class="btn btn-primary btn-block start" href={resolve('/workout/[id]', { id: upNext.id })}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M8 5.5v13l10-6.5z" />
				</svg>
				Start {upNext.key} day
			</a>
		</div>
	</section>

	{#if later.length}
		<h2 class="section-label">Then in rotation</h2>
		<ul class="list-group">
			{#each later as day (day.id)}
				<li>
					<a class="row-card" href={resolve('/workout/[id]', { id: day.id })}>
						<span class="badge badge-quiet">{day.key}</span>
						<span class="row-text">
							<span class="row-title">{day.title}</span>
							<span class="row-meta">
								{day.exerciseCount} exercises · {day.sets} sets{day.lastAt
									? ` · ${relativeDay(day.lastAt)}`
									: ''}
							</span>
						</span>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="currentColor"
							class="chev"
							aria-hidden="true"
						>
							<path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
						</svg>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.stats,
	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	/* Filled tiles: they separate from the page by tone, not by shadow. */
	.stat {
		min-width: 0;
		padding: 12px 14px;
		border-radius: var(--radius-md);
		background: var(--md-surface-container);
	}
	.stat-value {
		display: block;
		font-family: var(--font-heading);
		font-size: 28px;
		line-height: 36px;
		white-space: nowrap;
	}
	.stat-label {
		display: block;
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
	}

	/*
	 * A filled card, no outline or shadow, whose heading sits on a strip of the
	 * full primary — the one block of strong color on the screen, so the day in
	 * front of you is the first thing read. The open exercise in a workout uses
	 * the same shape a tone down.
	 */
	.hero {
		overflow: hidden;
		border-radius: var(--radius-lg);
		background: var(--md-surface-container);
	}
	.hero-head {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		color: var(--md-on-primary);
		background: var(--md-primary);
	}
	/* Inverted onto the strip: the page's surface with the primary as ink. */
	.hero-badge {
		color: var(--md-primary);
		background: var(--md-surface);
	}
	.hero-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
	}
	.hero-text {
		flex: 1;
		min-width: 0;
	}
	.hero-title {
		display: block;
		font-size: var(--text-lg);
		font-weight: 500;
		line-height: 24px;
	}
	.hero-meta {
		display: block;
		font-size: var(--text-md);
		opacity: 0.85;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	/* Block rather than the chip's flex, so a long name can ellipsize. */
	.chip {
		display: block;
		line-height: 30px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.start {
		margin-top: 0;
	}

	.row-text {
		flex: 1;
		min-width: 0;
	}
	.row-title {
		display: block;
		font-size: var(--text-base);
		line-height: 24px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-meta {
		display: block;
		font-size: var(--text-md);
		color: var(--md-on-surface-variant);
	}
</style>
