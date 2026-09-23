<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DumbbellIcon from './DumbbellIcon.svelte';
	import NavIcon from './NavIcon.svelte';
	import { destinations } from './nav';

	/**
	 * The desktop navigation.
	 *
	 * A floating tab bar is a phone idiom: it exists because the bottom of a
	 * phone is where your thumb already is. On a desktop window it reads as a
	 * phone screenshot dropped into a browser — so above 900px the tab bar goes
	 * away and this rail takes over, which is the shape every desktop app of this
	 * kind has. The two render the same destinations from `nav.ts`.
	 */
	type Props = {
		nextDayId: string | null;
		nextDayKey: string | null;
		build: { sha: string; time: string; timeISO: string };
	};
	let { nextDayId, nextDayKey, build }: Props = $props();

	const path = $derived(page.url.pathname);
	const links = destinations();
</script>

<nav class="rail" aria-label="Main">
	<div class="brand">
		<span class="mark"><DumbbellIcon size={24} /></span>
		<span class="wordmark">Workout</span>
	</div>

	{#if nextDayId}
		<a class="start" href={resolve('/workout/[id]', { id: nextDayId })}>
			<DumbbellIcon size={22} />
			<span>Start {nextDayKey ? `${nextDayKey} day` : 'workout'}</span>
		</a>
	{/if}

	<ul class="links">
		{#each links as link (link.href)}
			{@const on = link.match(path)}
			<li>
				<!-- Already resolved in nav.ts. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="link" class:on href={link.href} aria-current={on ? 'page' : undefined}>
					<NavIcon name={link.icon} />
					<span>{link.label}</span>
				</a>
			</li>
		{/each}
	</ul>

	<div class="foot">
		<small class="num selectable">
			{build.sha} ·
			{#if build.timeISO}
				<time datetime={build.timeISO}>{build.time}</time>
			{:else}
				{build.time}
			{/if}
		</small>
	</div>
</nav>

<style>
	/* Phones get the tab bar instead; this exists only once there is a window to
	   put it in. */
	.rail {
		display: none;
	}

	@media (min-width: 900px) and (pointer: fine) {
		.rail {
			display: flex;
			flex-direction: column;
			/* Stays put while the page scrolls under it, the way a real rail does. */
			position: sticky;
			align-self: start;
			top: 0;
			height: 100dvh;
			padding: 20px 14px 16px;
			padding-left: max(14px, env(safe-area-inset-left));
			padding-bottom: calc(16px + env(safe-area-inset-bottom));
			background: var(--md-surface-container-low);
		}
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 10px 0;
		color: var(--color-text);
	}
	.mark {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: var(--radius-md);
		background: var(--md-primary-container);
		color: var(--md-on-primary-container);
	}
	.wordmark {
		font-family: var(--font-heading);
		font-weight: 500;
		font-size: var(--text-lg);
	}

	/* The one thing you came here to do: an M3 extended FAB at the top of the
	   drawer, where M3 puts a drawer's primary action. */
	.start {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 18px 0 16px;
		min-height: 56px;
		padding: 0 20px 0 16px;
		border-radius: var(--radius-lg);
		background: var(--md-primary-container);
		color: var(--md-on-primary-container);
		box-shadow: var(--shadow-lg);
		text-decoration: none;
		font-weight: 500;
		font-size: var(--text-md);
	}
	.start:hover {
		color: var(--md-on-primary-container);
		background: color-mix(in srgb, var(--md-on-primary-container) 8%, var(--md-primary-container));
	}

	.links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	/* M3 navigation drawer items: 56px, fully rounded, the active one on the
	   secondary container. */
	.link {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 0 24px 0 16px;
		border-radius: var(--radius-pill);
		font-size: var(--text-md);
		font-weight: 500;
		color: var(--md-on-surface-variant);
		text-decoration: none;
	}
	.link:hover {
		color: var(--md-on-surface);
		background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
	}
	.link.on {
		color: var(--md-on-secondary-container);
		background: var(--md-secondary-container);
	}

	/* The build stamp lives down here on desktop rather than under the page, so
	   the content column ends with content. */
	.foot {
		margin-top: auto;
		padding: 12px 11px 0;
		border-top: 1px solid var(--md-outline-variant);
	}
	small {
		font-size: var(--text-xs);
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
</style>
