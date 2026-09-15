<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/shell/Header.svelte';
	import { provideChrome } from '$lib/shell/chrome.svelte';

	provideChrome();

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
	/>
</svelte:head>

<Header />

<main>
	{@render children()}
</main>

<footer>
	<small class="num">
		{data.build.sha} ·
		{#if data.build.timeISO}
			<time datetime={data.build.timeISO}>{data.build.time}</time>
		{:else}
			{data.build.time}
		{/if}
	</small>
</footer>

<style>
	main {
		max-width: var(--shell-width);
		margin: 0 auto;
		padding: 0 20px var(--space-8);
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
	}

	footer {
		max-width: var(--shell-width);
		margin: var(--space-8) auto 0;
		/* Nocturne rules fade to transparent over 48px at each end rather
		   than stopping cleanly. */
		padding: var(--space-4) 20px;
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
		/* Carries the clearance main used to hold: screens end in action
		   buttons that must sit above the home indicator. */
		padding-bottom: calc(96px + env(safe-area-inset-bottom));
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
		font-size: 11px;
		color: color-mix(in srgb, var(--color-text) 45%, transparent);
	}
</style>
