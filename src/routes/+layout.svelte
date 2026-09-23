<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/shell/Header.svelte';
	import { provideChrome } from '$lib/shell/chrome.svelte';
	import { provideOffline } from '$lib/offline/context.svelte';
	import { provideTheme } from '$lib/theme/theme.svelte';
	import TabBar from '$lib/shell/TabBar.svelte';
	import SideRail from '$lib/shell/SideRail.svelte';
	import SyncBanner from '$lib/offline/SyncBanner.svelte';

	provideChrome();
	const { queue } = provideOffline();
	const theme = provideTheme();

	// Reads the stored choice and follows the OS while `system` is selected.
	$effect(() => theme.start());

	/**
	 * Drains on load, whenever the network returns, and whenever the app comes
	 * back to the foreground — an installed PWA is far more often resumed than
	 * reloaded, so focus is the signal that matters most.
	 */
	$effect(() => {
		void queue.load().then(() => queue.drain());

		const wake = () => void queue.drain();
		const onVisible = () => {
			if (document.visibilityState === 'visible') wake();
		};
		window.addEventListener('online', wake);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.removeEventListener('online', wake);
			document.removeEventListener('visibilitychange', onVisible);
			queue.clearRetry();
		};
	});

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,400;8..144,500;8..144,600&display=swap"
	/>
</svelte:head>

<div class="app">
	<SideRail nextDayId={data.nextDayId} nextDayKey={data.nextDayKey} build={data.build} />

	<div class="column">
		<Header />

		<div class="banner-slot">
			<SyncBanner />
		</div>

		<main>
			{@render children()}
		</main>

		<footer>
			<small class="num selectable">
				{data.build.sha} ·
				{#if data.build.timeISO}
					<time datetime={data.build.timeISO}>{data.build.time}</time>
				{:else}
					{data.build.time}
				{/if}
			</small>
		</footer>
	</div>
</div>

<TabBar />

<style>
	/*
	 * One column on a phone, two once there is a window: a fixed navigation rail
	 * beside the content. The rail hides itself below 900px, so on a phone this
	 * grid never applies and the page is exactly what it was.
	 */
	.app {
		display: block;
	}
	.column {
		min-width: 0;
	}

	@media (min-width: 900px) and (pointer: fine) {
		.app {
			display: grid;
			grid-template-columns: var(--rail-width) minmax(0, 1fr);
			min-height: 100dvh;
		}
	}

	.banner-slot {
		padding: 0 var(--gutter);
		padding-left: max(var(--gutter), env(safe-area-inset-left));
		padding-right: max(var(--gutter), env(safe-area-inset-right));
	}

	main {
		max-width: var(--shell-width);
		margin: 0 auto;
		/* The tab bar's clearance is the footer's job (below); this is only the
		   gap between the last card and the footer's rule. Holding both put
		   about 230px of empty scroll at the end of every page. */
		padding: 18px var(--gutter) 24px;
		padding-left: max(var(--gutter), env(safe-area-inset-left));
		padding-right: max(var(--gutter), env(safe-area-inset-right));
	}

	footer {
		max-width: var(--shell-width);
		margin: 0 auto;
		/* Nocturne rules fade to transparent over 48px at each end rather
		   than stopping cleanly. */
		padding: var(--space-4) var(--gutter);
		padding-left: max(var(--gutter), env(safe-area-inset-left));
		padding-right: max(var(--gutter), env(safe-area-inset-right));
		/* Clears the bottom navigation bar and the home indicator: screens end
		   in action buttons that must not sit under either. */
		padding-bottom: calc(var(--nav-height) + 16px + env(safe-area-inset-bottom));
		background: linear-gradient(
				to right,
				transparent,
				var(--color-divider) 48px,
				var(--color-divider) calc(100% - 48px),
				transparent
			)
			no-repeat top / 100% 1px;
	}
	small {
		font-size: var(--text-xs);
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}

	@media (min-width: 900px) and (pointer: fine) {
		main {
			/* Nothing floats over the bottom of a desktop window, so the page can
			   end where the content does. */
			padding-top: 26px;
			padding-bottom: 40px;
		}
		/* The build stamp moves into the rail's foot. */
		footer {
			display: none;
		}
	}
</style>
