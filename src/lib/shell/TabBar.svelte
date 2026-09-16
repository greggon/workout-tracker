<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DumbbellIcon from './DumbbellIcon.svelte';
	import { destinations } from './nav';

	/**
	 * The floating tab bar from v2. Four destinations either side of a center
	 * action that starts the next workout.
	 *
	 * Hidden during a workout: the screen is a single task with its own finish
	 * button, and a bar offering to navigate away mid-set is an invitation to
	 * lose your place. Hidden again above 900px, where SideRail takes over — the
	 * two read the same destination list.
	 */
	type Props = { nextDayId: string | null };
	let { nextDayId }: Props = $props();

	const path = $derived(page.url.pathname);
	const hidden = $derived(path.startsWith('/workout/'));

	const tabs = destinations();

	const left = tabs.slice(0, 2);
	const right = tabs.slice(2);
</script>

{#if !hidden}
	<nav class="wrap" aria-label="Main">
		<div class="bar">
			{#each left as tab (tab.href)}
				<!-- nav.ts resolves these once; resolve() here would be resolving an
				     already-resolved path. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="tab" class:on={tab.match(path)} href={tab.href}>{tab.label}</a>
			{/each}

			<div class="fab-slot">
				{#if nextDayId}
					<a
						class="fab"
						href={resolve('/workout/[id]', { id: nextDayId })}
						title="Start the next day"
						aria-label="Start the next day"
					>
						<DumbbellIcon size={28} />
					</a>
				{/if}
			</div>

			{#each right as tab (tab.href)}
				<!-- nav.ts resolves these once; resolve() here would be resolving an
				     already-resolved path. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="tab" class:on={tab.match(path)} href={tab.href}>{tab.label}</a>
			{/each}
		</div>
	</nav>
{/if}

<style>
	.wrap {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.bar {
		width: min(var(--shell-width), 100%);
		margin: 0 12px 12px;
		background: var(--color-surface);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-md);
		display: flex;
		align-items: center;
		padding: 8px 10px;
		pointer-events: auto;
	}

	.tab {
		flex: 1;
		text-align: center;
		padding: 7px 2px 6px;
		border-radius: var(--radius-md);
		font-size: 10.5px;
		letter-spacing: 0.01em;
		color: var(--color-neutral-500);
		text-decoration: none;
	}
	.tab.on {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}

	.fab-slot {
		flex: none;
		width: 76px;
		display: flex;
		justify-content: center;
	}
	.fab {
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		margin-top: -22px;
		border-radius: var(--radius-pill);
		background: linear-gradient(160deg, var(--color-section-glow), var(--color-section) 62%);
		color: var(--on-section);
		box-shadow: var(--shadow-md);
		text-decoration: none;
	}
	.fab:hover {
		color: var(--on-section);
		filter: brightness(1.12);
	}

	/* The rail replaces this once the window is wide enough to hold one. Last in
	   the sheet on purpose: a media query adds no specificity, so this has to
	   come after `.wrap`'s own `display: flex` to win. */
	@media (min-width: 900px) and (pointer: fine) {
		.wrap {
			display: none;
		}
	}
</style>
