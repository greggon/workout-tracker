<script lang="ts">
	import { resolve } from '$app/paths';
	import { useOffline } from './context.svelte';

	const { queue } = useOffline();

	const message = $derived.by(() => {
		if (queue.pending === 0) return null;
		const n = queue.pending;
		const workouts = `${n} workout${n === 1 ? '' : 's'}`;

		switch (queue.status) {
			case 'reauth':
				return {
					tone: 'warn' as const,
					text: `Signed out — ${workouts} waiting on this device.`,
					action: 'Sign in',
					href: resolve('/')
				};
			case 'offline':
				return {
					tone: 'quiet' as const,
					text: `No connection — ${workouts} will send when you are back.`,
					action: 'Try now',
					href: null
				};
			case 'rejected':
				return {
					tone: 'warn' as const,
					text: queue.lastError ?? `The server refused ${workouts}.`,
					action: 'Try again',
					href: null
				};
			case 'syncing':
				return { tone: 'quiet' as const, text: `Sending ${workouts}…`, action: null, href: null };
			default:
				return {
					tone: 'quiet' as const,
					text: `${workouts} waiting to send.`,
					action: 'Send',
					href: null
				};
		}
	});

	function act() {
		if (queue.status === 'rejected') void queue.retryRejected();
		else void queue.drain();
	}
</script>

{#if message}
	<div class="banner" class:warn={message.tone === 'warn'} role="status">
		<span class="text">{message.text}</span>
		{#if message.action && message.href}
			<a class="btn btn-ghost act" href={message.href} data-sveltekit-reload>{message.action}</a>
		{:else if message.action}
			<button class="btn btn-ghost act" onclick={act}>{message.action}</button>
		{/if}
	</div>
{/if}

<style>
	/* An inline M3 banner: a tonal container with a text-button action. */
	.banner {
		max-width: var(--shell-width);
		margin: 0 auto 12px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 8px 4px 16px;
		min-height: 48px;
		border-radius: var(--radius-md);
		background: var(--md-surface-container-high);
		color: var(--md-on-surface);
		font-size: var(--text-md);
	}
	.warn {
		background: var(--md-tertiary-container);
		color: var(--md-on-tertiary-container);
	}
	.warn .act {
		color: var(--md-on-tertiary-container);
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.act {
		flex: none;
		font-size: var(--text-md);
		text-decoration: none;
	}
</style>
