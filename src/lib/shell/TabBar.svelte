<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DumbbellIcon from './DumbbellIcon.svelte';
	import NavIcon from './NavIcon.svelte';
	import { destinations } from './nav';

	/**
	 * The floating tab bar from v2. Four destinations either side of a center
	 * action that starts the next workout.
	 *
	 * Hidden during a workout: the screen is a single task with its own finish
	 * button, and a bar offering to navigate away mid-set is an invitation to
	 * lose your place. Hidden in the day editor for the same reason — it is a
	 * form with its own back link and a pinned Save bar where this would sit.
	 * Hidden again above 900px, where SideRail takes over — the two read the
	 * same destination list.
	 */
	type Props = { nextDayId: string | null };
	let { nextDayId }: Props = $props();

	const path = $derived(page.url.pathname);
	const hidden = $derived(path.startsWith('/workout/') || /^\/routine\/[^/]+/.test(path));

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
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="tab"
					class:on={tab.match(path)}
					href={tab.href}
					aria-current={tab.match(path) ? 'page' : undefined}
				>
					<NavIcon name={tab.icon} size={20} />
					<span>{tab.label}</span>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}

			<!-- Always drawn. With no day to start, an empty slot in the middle of
			     the bar read as something failing to load; setting up the routine
			     is the thing to do next instead. -->
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
				{:else}
					<a
						class="fab"
						href={resolve('/routine')}
						title="Set up your routine"
						aria-label="Set up your routine"
					>
						<DumbbellIcon size={28} />
					</a>
				{/if}
			</div>

			{#each right as tab (tab.href)}
				<!-- nav.ts resolves these once; resolve() here would be resolving an
				     already-resolved path. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="tab"
					class:on={tab.match(path)}
					href={tab.href}
					aria-current={tab.match(path) ? 'page' : undefined}
				>
					<NavIcon name={tab.icon} size={20} />
					<span>{tab.label}</span>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
		padding: 6px 8px;
		pointer-events: auto;
	}

	/* The rail's glyphs over the label, so the phone and desktop navigations
	   read as one. 52px tall: a label alone came out near 30px, well under the
	   44px everything else here is held to. */
	.tab {
		flex: 1;
		min-width: 0;
		min-height: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 4px 2px;
		border-radius: 18px;
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.1;
		color: var(--color-neutral-500);
		text-decoration: none;
	}
	.tab.on {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}

	.fab-slot {
		flex: none;
		width: 72px;
		display: flex;
		justify-content: center;
	}
	.fab {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		margin-top: -24px;
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
