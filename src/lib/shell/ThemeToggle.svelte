<script lang="ts">
	import { useTheme } from '$lib/theme/theme.svelte';

	const theme = useTheme();

	const icon = $derived(
		theme.choice === 'system' ? 'auto' : theme.choice === 'light' ? 'sun' : 'moon'
	);
	const label = $derived(
		theme.choice === 'system'
			? `Theme: following your device (${theme.systemPrefers})`
			: `Theme: ${theme.choice}`
	);
</script>

<button
	class="btn btn-icon toggle"
	type="button"
	onclick={() => theme.set(theme.next())}
	title={label}
	aria-label={label}
>
	{#if icon === 'sun'}
		<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
			<path
				d="M120 40V16a8 8 0 0 1 16 0v24a8 8 0 0 1-16 0Zm72 88a64 64 0 1 1-64-64 64.07 64.07 0 0 1 64 64Zm-16 0a48 48 0 1 0-48 48 48.05 48.05 0 0 0 48-48ZM58.3 69.7a8 8 0 0 0 11.4-11.4l-16-16a8 8 0 0 0-11.4 11.4Zm0 116.6-16 16a8 8 0 0 0 11.4 11.4l16-16a8 8 0 0 0-11.4-11.4ZM192 72a8 8 0 0 0 5.7-2.3l16-16a8 8 0 0 0-11.4-11.4l-16 16A8 8 0 0 0 192 72Zm5.7 114.3a8 8 0 0 0-11.4 11.4l16 16a8 8 0 0 0 11.4-11.4ZM48 128a8 8 0 0 0-8-8H16a8 8 0 0 0 0 16h24a8 8 0 0 0 8-8Zm80 80a8 8 0 0 0-8 8v24a8 8 0 0 0 16 0v-24a8 8 0 0 0-8-8Zm112-88h-24a8 8 0 0 0 0 16h24a8 8 0 0 0 0-16Z"
			/>
		</svg>
	{:else if icon === 'moon'}
		<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
			<path
				d="M233.5 142.2a8 8 0 0 0-8-2 88 88 0 0 1-109.7-109.7 8 8 0 0 0-10-10 104 104 0 1 0 129.7 129.7 8 8 0 0 0-2-8Zm-105.5 66a88.1 88.1 0 0 1-88-88 87 87 0 0 1 9-38.8 104.2 104.2 0 0 0 117.8 117.8 87 87 0 0 1-38.8 9Z"
			/>
		</svg>
	{:else}
		<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
			<path
				d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm0 192V40a88 88 0 0 1 0 176Z"
			/>
		</svg>
	{/if}
</button>

<style>
	/* An M3 standard icon button; the shared .btn-icon supplies its size, ink
	   and state layer. */
	.toggle {
		flex: none;
	}
</style>
