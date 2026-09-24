<script lang="ts">
	import { equivalentMessage, formatCount, pickEquivalent, unitName } from './equivalents';

	/**
	 * "That's 3 Cybertrucks!" under a finished workout's numbers.
	 *
	 * It lands just after the fireworks start: the card springs in, the emoji
	 * wobbles, and the count ticks up from zero to the real figure. With reduced
	 * motion it simply appears, already at the final number.
	 */
	type Props = { volume: number };
	let { volume }: Props = $props();

	/*
	 * Drawn once per screen. The thing is random, but it must not change when
	 * the component re-renders — say, when the server's summary replaces the
	 * on-device numbers — so the dice are rolled here, once, and reused.
	 */
	const roll = Math.random();
	const pick = $derived(pickEquivalent(volume, () => roll));

	const DELAY_MS = 450;
	const COUNT_MS = 900;
	let shown = $state(0);

	$effect(() => {
		if (!pick) return;
		const target = pick.count;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			shown = target;
			return;
		}
		shown = 0;
		let frame = 0;
		const start = performance.now() + DELAY_MS;
		const step = (now: number) => {
			const p = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
			// Fast at first, settling onto the number.
			shown = target * (1 - (1 - p) ** 3);
			if (p < 1) frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	});
</script>

{#if pick}
	<div class="equivalent">
		<!-- Read once, whole, rather than as a number ticking up. -->
		<p class="visually-hidden">{equivalentMessage(pick)}</p>
		<span class="emoji" aria-hidden="true">{pick.item.emoji}</span>
		<p class="line" aria-hidden="true">
			<span class="lead">That's</span>
			<span class="big">
				<span class="count num">{formatCount(shown)}</span>
				{unitName(pick.item, pick.count)}!
			</span>
		</p>
	</div>
{/if}

<style>
	.equivalent {
		display: flex;
		align-items: center;
		gap: 16px;
		margin: 0 0 24px;
		padding: 16px 20px;
		border-radius: var(--radius-lg);
		background: var(--md-primary-container);
		color: var(--md-on-primary-container);
		animation: spring-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.45s both;
	}
	.emoji {
		flex: none;
		font-size: 48px;
		line-height: 1;
		animation: wobble 0.9s ease-in-out 0.9s 2 both;
		transform-origin: 50% 80%;
	}
	.line {
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.lead {
		font-size: var(--text-md);
		font-weight: 500;
	}
	/* The payoff: big, heavy, and shaded from the primary into the tertiary. */
	.big {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
		background: linear-gradient(95deg, var(--md-primary), var(--md-on-tertiary-container));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.count {
		display: inline-block;
		min-width: 1ch;
	}

	@keyframes spring-in {
		from {
			opacity: 0;
			transform: scale(0.6) rotate(-3deg);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes wobble {
		0%,
		100% {
			transform: rotate(0) scale(1);
		}
		25% {
			transform: rotate(-14deg) scale(1.15);
		}
		50% {
			transform: rotate(10deg) scale(1.1);
		}
		75% {
			transform: rotate(-6deg) scale(1.05);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.equivalent,
		.emoji {
			animation: none;
		}
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
