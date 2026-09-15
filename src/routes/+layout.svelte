<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/shell/Header.svelte';
	import { provideChrome } from '$lib/shell/chrome.svelte';

	provideChrome();

	let { children } = $props();
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

<style>
	main {
		max-width: var(--shell-width);
		margin: 0 auto;
		/* Bottom room is generous on purpose: the design's screens end in
		   action buttons that must clear the home indicator. */
		padding: 0 20px calc(120px + env(safe-area-inset-bottom));
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
	}
</style>
