<script lang="ts">
	import { resolve } from '$app/paths';
	import { useChrome } from './chrome.svelte';

	const chrome = useChrome();

	const showClocks = $derived(chrome.sessionClock !== null);
	const progressPct = $derived(
		chrome.progress === null ? null : `${(chrome.progress * 100).toFixed(1)}%`
	);
</script>

<header>
	<div class="bar">
		<a class="brand" href={resolve('/')}>Workout</a>

		{#if showClocks}
			<div class="clocks">
				<div class="clock">
					<div class="clock-label">Session</div>
					<div class="num clock-value">{chrome.sessionClock}</div>
				</div>
				<div class="divider"></div>
				<div class="clock rest">
					<div class="clock-label">Rest</div>
					<div class="num clock-value rest-value">{chrome.restClock}</div>
				</div>
			</div>
		{/if}

		{#if chrome.onEdit}
			<button
				class="btn btn-secondary btn-icon"
				title="Edit this routine"
				aria-label="Edit this routine"
				onclick={chrome.onEdit}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
				</svg>
			</button>
		{/if}
	</div>

	{#if progressPct !== null}
		<div class="track" role="presentation">
			<div class="fill" style:width={progressPct}></div>
		</div>
	{/if}
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 20;
		/* Fades rather than cuts, so content scrolling under it dissolves
		   instead of hitting a hard edge. */
		background: linear-gradient(var(--color-bg) 70%, transparent);
		backdrop-filter: blur(6px);
		/* Clears the notch when installed to the home screen. */
		padding-top: env(safe-area-inset-top);
	}

	.bar {
		max-width: var(--shell-width);
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 20px 12px;
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
	}

	.brand {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 17px;
		letter-spacing: -0.01em;
		color: var(--color-text);
		text-decoration: none;
		margin-right: auto;
	}
	.brand:hover {
		color: var(--color-accent);
	}

	.clocks {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.clock {
		text-align: right;
	}
	.rest {
		min-width: 78px;
	}
	.clock-label {
		font-size: 9px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.clock-value {
		font-family: var(--font-heading);
		font-size: 18px;
		line-height: 1.1;
	}
	.rest-value {
		color: var(--color-accent-300);
	}
	.divider {
		width: 1px;
		height: 26px;
		background: var(--color-divider);
	}

	.track {
		max-width: var(--shell-width);
		margin: 0 auto;
		height: 3px;
		border-radius: 2px;
		background: var(--color-neutral-900);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 2px;
		transition: width 0.35s ease;
	}
</style>
