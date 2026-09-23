<script lang="ts">
	import { page } from '$app/state';
	import NavIcon from './NavIcon.svelte';
	import { destinations } from './nav';

	/**
	 * The M3 navigation bar: the four destinations, each an icon in a pill-shaped
	 * active indicator over its label.
	 *
	 * Starting a workout is not in here. It had a raised center button, but the
	 * Up Next screen leads with the same action, so the bar is navigation only.
	 *
	 * Hidden during a workout: the screen is a single task with its own finish
	 * button, and a bar offering to navigate away mid-set is an invitation to
	 * lose your place. Hidden in the day editor for the same reason — it is a
	 * form with its own back link and a pinned Save bar where this would sit.
	 * Hidden again above 900px, where SideRail takes over — the two read the
	 * same destination list.
	 */
	const path = $derived(page.url.pathname);
	const hidden = $derived(path.startsWith('/workout/') || /^\/routine\/[^/]+/.test(path));

	const tabs = destinations();
</script>

{#if !hidden}
	<nav class="bar" aria-label="Main">
		{#each tabs as tab (tab.href)}
			{@const on = tab.match(path)}
			<!-- nav.ts resolves these once; resolve() here would be resolving an
			     already-resolved path. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a class="tab" class:on href={tab.href} aria-current={on ? 'page' : undefined}>
				<span class="indicator"><NavIcon name={tab.icon} size={24} /></span>
				<span class="text">{tab.label}</span>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/each}
	</nav>
{/if}

<style>
	.bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		gap: 8px;
		min-height: var(--nav-height);
		padding: 12px 8px calc(16px + env(safe-area-inset-bottom));
		background: var(--md-surface-container);
	}

	.tab {
		flex: 1;
		max-width: 120px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		color: var(--md-on-surface-variant);
		text-decoration: none;
	}
	.tab:hover {
		color: var(--md-on-surface);
	}
	/* The active indicator: a 64×32 pill around the icon. It carries the state
	   layer too, so hover and press land on the pill rather than the column. */
	.indicator {
		display: grid;
		place-items: center;
		width: 64px;
		height: 32px;
		border-radius: var(--radius-pill);
		transition: background-color 0.2s ease;
	}
	.tab:hover .indicator {
		background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
	}
	.on .indicator,
	.on:hover .indicator {
		color: var(--md-on-secondary-container);
		background: var(--md-secondary-container);
	}
	.text {
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 16px;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}
	.on {
		color: var(--md-on-surface);
	}
	.on .text {
		font-weight: 600;
	}

	/* The rail replaces this once the window is wide enough to hold one. Last in
	   the sheet on purpose: a media query adds no specificity, so this has to
	   come after `.bar`'s own `display: flex` to win. */
	@media (min-width: 900px) and (pointer: fine) {
		.bar {
			display: none;
		}
	}
</style>
