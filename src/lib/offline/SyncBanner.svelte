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
	.banner {
		max-width: var(--shell-width);
		margin: 0 auto 12px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 14px;
		border-radius: var(--radius-md);
		background: var(--color-neutral-900);
		color: var(--color-neutral-300);
		font-size: 12.5px;
	}
	.warn {
		background: var(--color-accent-900);
		color: var(--color-accent-200);
		box-shadow: inset 0 0 0 1px var(--color-accent-700);
	}
	.text {
		flex: 1;
		min-width: 0;
	}
	.act {
		flex: none;
		font-size: 12.5px;
		text-decoration: none;
	}
</style>
