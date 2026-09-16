<script lang="ts">
	import { resolve } from '$app/paths';
	import { TOOL_LABELS } from '$lib/types';
	import { relativeDay } from '$lib/volume';

	let { data } = $props();
</script>

<svelte:head><title>History</title></svelte:head>

{#if data.movements.length === 0}
	<div class="card">
		<div class="card-title">Nothing logged yet</div>
		<p class="text-muted">Finish a workout and every movement in it shows up here.</p>
	</div>
{:else}
	<ul class="list">
		{#each data.movements as m (m.movementId)}
			<li>
				<a class="row-card" href={resolve('/movements/[id]', { id: m.movementId })}>
					<span class="text">
						<span class="name">{m.name}</span>
						<span class="meta">
							{TOOL_LABELS[m.tool]} · {m.sessionCount} session{m.sessionCount === 1 ? '' : 's'} · {relativeDay(
								m.lastAt
							)}
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

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 16.5px;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: block;
		font-size: 12px;
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
</style>
