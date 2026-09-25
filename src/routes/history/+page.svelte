<script lang="ts">
	import { resolve } from '$app/paths';
	import { TOOL_LABELS } from '$lib/types';
	import { formatVolume, relativeDay } from '$lib/volume';

	let { data } = $props();

	const dateLabel = (at: number) =>
		new Date(at).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
</script>

<svelte:head><title>My History</title></svelte:head>

<!--
	M3 primary tabs. They are links, not a tablist: each tab is its own URL, so
	the back link from a workout lands on the tab it came from.
-->
<nav class="tabs" aria-label="History">
	<a
		class="tab"
		class:on={data.tab === 'lifts'}
		href={resolve('/history')}
		aria-current={data.tab === 'lifts' ? 'page' : undefined}
	>
		Lifts
	</a>
	<a
		class="tab"
		class:on={data.tab === 'workouts'}
		href="{resolve('/history')}?tab=workouts"
		aria-current={data.tab === 'workouts' ? 'page' : undefined}
	>
		Workouts
	</a>
</nav>

{#if data.tab === 'workouts'}
	{#if data.workouts.length === 0}
		<div class="card">
			<div class="card-title">No workouts yet</div>
			<p class="text-muted">Finished workouts show up here, newest first, ready to correct.</p>
		</div>
	{:else}
		<ul class="list-group">
			{#each data.workouts as w (w.id)}
				<li>
					<a class="row-card" href={resolve('/history/workouts/[id]', { id: w.id })}>
						<span class="badge badge-quiet">{w.dayKey}</span>
						<span class="text">
							<span class="name">{dateLabel(w.startedAt)}</span>
							<span class="meta num">
								{w.dayTitle ? `${w.dayTitle} · ` : ''}{w.durationMins} min · {w.setCount} set{w.setCount ===
								1
									? ''
									: 's'} · {formatVolume(w.volume)} lb
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
{:else if data.movements.length === 0}
	<div class="card">
		<div class="card-title">Nothing logged yet</div>
		<p class="text-muted">Finish a workout and every movement in it shows up here.</p>
	</div>
{:else}
	<ul class="list-group">
		{#each data.movements as m (m.movementId)}
			<li>
				<a class="row-card" href={resolve('/history/[id]', { id: m.movementId })}>
					<span class="text">
						<span class="name">{m.name}</span>
						<span class="meta">
							{TOOL_LABELS[m.tool]} · {m.sessionCount} session{m.sessionCount === 1 ? '' : 's'} · {relativeDay(
								m.lastAt
							)}
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

<style>
	/* Equal-width tabs with the M3 active indicator: a 3px bar under the label,
	   rounded on top. */
	.tabs {
		display: flex;
		margin: -8px calc(-1 * var(--gutter)) 16px;
		padding: 0 var(--gutter);
		border-bottom: 1px solid var(--md-outline-variant);
	}
	.tab {
		position: relative;
		flex: 1;
		display: grid;
		place-items: center;
		min-height: 48px;
		font-size: var(--text-md);
		font-weight: 500;
		color: var(--md-on-surface-variant);
		text-decoration: none;
	}
	.tab:hover {
		color: var(--md-on-surface);
		background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
	}
	.tab.on {
		color: var(--md-primary);
	}
	.tab.on::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 64px;
		height: 3px;
		margin-left: -32px;
		border-radius: 3px 3px 0 0;
		background: var(--md-primary);
	}

	.text {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: block;
		font-size: var(--text-base);
		line-height: 24px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: block;
		font-size: var(--text-md);
		color: var(--md-on-surface-variant);
	}
</style>
