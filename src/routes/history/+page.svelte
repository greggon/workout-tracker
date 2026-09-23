<script lang="ts">
	import { resolve } from '$app/paths';
	import { TOOL_LABELS } from '$lib/types';
	import { relativeDay } from '$lib/volume';

	let { data } = $props();
</script>

<svelte:head><title>My History</title></svelte:head>

{#if data.movements.length === 0}
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
