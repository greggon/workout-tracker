<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatMinutes, formatVolume, relativeDay } from '$lib/volume';

	let { data } = $props();

	const upNext = $derived(data.days[0] ?? null);
	const later = $derived(data.days.slice(1));

	/** Thousands, because planned volume runs to five figures and the tile is narrow. */
	const thousands = (n: number) => `${Math.round(n / 100) / 10}k`;

	const tiles = $derived(
		upNext
			? [
					{ value: String(upNext.exerciseCount), label: 'exercises' },
					{ value: String(upNext.sets), label: 'sets' },
					{ value: thousands(upNext.volume), label: 'lb planned' }
				]
			: []
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
	<h2 class="label section section-top">This month</h2>
	<ul class="stats">
		{#each stats as stat, i (stat.label)}
			<li class="stat">
				<span class="cap" data-cap={i}></span>
				<span class="tile-value num">{stat.value}</span>
				<span class="tile-label">{stat.label}</span>
			</li>
		{/each}
	</ul>

	<h2 class="label section section-lead">Up next</h2>
	<section class="hero card">
		<div class="hero-head">
			<span class="badge">{upNext.key}</span>
			<span class="hero-text">
				<span class="hero-title">{upNext.title}</span>
			</span>
		</div>

		<ul class="tiles">
			{#each tiles as tile, i (tile.label)}
				<li class="tile">
					<span class="cap" data-cap={i}></span>
					<span class="tile-value num">{tile.value}</span>
					<span class="tile-label">{tile.label}</span>
				</li>
			{/each}
		</ul>

		<ul class="lines">
			{#each upNext.chips as chip, i (i)}
				<li class="line"><span class="line-name">{chip}</span></li>
			{/each}
		</ul>

		<a class="btn btn-primary btn-block" href={resolve('/workout/[id]', { id: upNext.id })}>
			Start {upNext.key} day
		</a>
	</section>

	{#if later.length}
		<h2 class="label section">Then in rotation</h2>
		<ul class="rotation">
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
							width="17"
							height="17"
							viewBox="0 0 256 256"
							fill="currentColor"
							class="chev"
							aria-hidden="true"
						>
							<path
								d="M181.7 133.7l-80 80a8 8 0 0 1-11.4-11.4L164.7 128 90.3 53.7a8 8 0 0 1 11.4-11.4l80 80a8 8 0 0 1 0 11.4Z"
							/>
						</svg>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.hero {
		gap: 0;
	}
	.hero-head {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.hero-text {
		flex: 1;
		min-width: 0;
	}
	.hero-title {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 19px;
		letter-spacing: -0.015em;
		line-height: 1.2;
	}

	.badge {
		flex: none;
		width: 46px;
		height: 46px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		font-family: var(--font-heading);
		font-size: 20px;
		color: var(--color-accent-100);
		background: var(--color-accent-800);
		box-shadow: inset 0 0 0 1px var(--color-accent-600);
	}
	.badge-quiet {
		width: 40px;
		height: 40px;
		font-size: 17px;
		color: var(--color-neutral-300);
		background: var(--color-neutral-900);
		box-shadow: none;
	}

	.tiles,
	.lines,
	.rotation,
	.stats {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.tiles,
	.stats {
		display: flex;
		gap: 8px;
	}
	.tiles {
		margin-top: 16px;
	}
	.tile,
	.stat {
		flex: 1;
		min-width: 0;
		border-radius: var(--radius-md);
		padding: 12px 10px 13px;
		text-align: center;
	}
	.tile {
		background: var(--color-bg);
	}
	.stat {
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		border-radius: var(--radius-md);
		text-align: left;
		padding: 14px;
	}
	/* A short colored cap above each figure, so three identical tiles are
	   still distinguishable at a glance. */
	.cap {
		display: block;
		width: 18px;
		height: 3px;
		border-radius: var(--radius-pill);
		margin-bottom: 9px;
	}
	.tile .cap {
		margin-inline: auto;
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
	.tile-value {
		display: block;
		font-family: var(--font-heading);
		font-size: 21px;
		line-height: 1.2;
	}
	.tile-label {
		display: block;
		font-size: 11.5px;
		color: var(--color-neutral-500);
		margin-top: 1px;
	}

	.lines {
		display: flex;
		flex-direction: column;
		gap: 7px;
		margin-top: 16px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13.5px;
	}
	.line-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.section {
		color: var(--color-neutral-500);
		margin: 24px 0 10px;
	}
	/* First thing on the page, so it takes the shell's padding rather than
	   adding its own on top of it. */
	.section-top {
		margin-top: 0;
	}
	/* The seam between the month's figures and the day in front of you gets more
	   air than the 24px rhythm between a heading and its own content. */
	.section-lead {
		margin-top: 32px;
	}

	.rotation {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row-text {
		flex: 1;
		min-width: 0;
	}
	.row-title {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 16.5px;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-meta {
		display: block;
		font-size: 12px;
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
</style>
