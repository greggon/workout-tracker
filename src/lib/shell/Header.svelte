<script lang="ts">
	import { page } from '$app/state';
	import type { PageHeader } from './page-header';
	import ThemeToggle from './ThemeToggle.svelte';
	import { useChrome } from './chrome.svelte';

	const chrome = useChrome();

	/**
	 * The title comes from route data rather than an effect. Effects do not run
	 * during SSR, so a header driven by one renders blank in the server HTML and
	 * only fills in after hydration — a visible flash on every single load.
	 *
	 * The shape is declared on `App.PageData`, so this reads a checked type
	 * rather than casting whatever `data` happens to carry.
	 *
	 * The clocks stay on `chrome`: those genuinely only exist once a workout is
	 * running in the browser.
	 */
	const header = $derived<PageHeader>(page.data.header ?? { title: '' });

	const showClocks = $derived(chrome.sessionClock !== null);
	const progressPct = $derived(
		chrome.progress === null ? null : `${(chrome.progress * 100).toFixed(1)}%`
	);
</script>

<!--
	An M3 large top app bar: a 64px row of icon buttons — back on the left, the
	theme toggle on the right — with the headline under it. It sits on the page's
	own surface; the page scrolls it away.
-->
<header class:training={showClocks}>
	<div class="inner">
		{#if showClocks}
			<!--
				Training. The bar becomes the instrument panel and is pinned: a session
				clock you have to scroll up to read is a clock you stop reading, and
				rest between sets is timed by the one number that goes off screen
				first. The day and its title are the first thing on the page below,
				so the headline steps out to keep the panel short enough to pin.
			-->
			<div class="clocks">
				<div class="clock">
					<div class="label clock-label">Session</div>
					<div class="num clock-value">{chrome.sessionClock}</div>
				</div>
				<div class="clock rest">
					<div class="label clock-label">Resting</div>
					<div class="num clock-value">{chrome.restClock}</div>
				</div>
			</div>
		{:else}
			<div class="bar">
				{#if header.back}
					<!--
						Back is navigation, so it is a link: middle-click, long-press and
						"open in new tab" all work, and it needs no JavaScript. Callers put
						an already-resolved path into header.back, so resolve() here would
						be resolving a resolved path.
					-->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="btn btn-icon back" href={header.back} aria-label="Back">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
						</svg>
					</a>
				{/if}
				<!-- Off during a workout: the theme is not something you change
				     mid-set. -->
				<ThemeToggle />
			</div>

			<div class="titles">
				{#if header.kicker}
					<div class="label kicker">{header.kicker}</div>
				{/if}
				<h1 class="title">{header.title}</h1>
			</div>
		{/if}

		{#if progressPct !== null}
			<div class="progress">
				<div class="track"><div class="fill" style:width={progressPct}></div></div>
				{#if chrome.progressText}
					<span class="num progress-text">{chrome.progressText}</span>
				{/if}
			</div>
		{/if}
	</div>
</header>

<style>
	header {
		padding-top: env(safe-area-inset-top);
		background: var(--md-surface);
	}

	.inner {
		max-width: var(--shell-width);
		margin: 0 auto;
		padding: 0 var(--gutter);
		padding-left: max(var(--gutter), env(safe-area-inset-left));
		padding-right: max(var(--gutter), env(safe-area-inset-right));
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
		height: 64px;
		/* Icon buttons sit on the gutter by their glyph, not their 48px box. */
		margin-inline: -12px;
	}
	.back {
		margin-right: auto;
		color: var(--md-on-surface);
	}

	.titles {
		min-width: 0;
		padding: 4px 0 20px;
	}
	.kicker {
		color: var(--md-primary);
		margin-bottom: 4px;
	}
	.title {
		margin: 0;
		font-family: var(--font-heading);
		font-weight: 400;
		font-size: var(--text-2xl);
		line-height: 40px;
		color: var(--md-on-surface);
		overflow-wrap: anywhere;
	}

	/*
	 * Training: pinned, on the surface container so the page visibly scrolls
	 * under it.
	 */
	/*
	 * The bottom 12px of the pinned bar is the page's own surface, not the
	 * bar's grey. The open exercise card is that same grey, and without the
	 * gap it slid up under the bar and the two ran together; with it, whatever
	 * scrolls underneath disappears into the page color first. Being part of
	 * the header, the gap is included in the height the workout screen measures
	 * when it scrolls the next exercise into view.
	 */
	header.training {
		--gap: 12px;
		position: sticky;
		top: 0;
		z-index: 30;
		padding-bottom: calc(12px + var(--gap));
		background: linear-gradient(
			to bottom,
			var(--md-surface-container) calc(100% - var(--gap)),
			var(--md-surface) calc(100% - var(--gap))
		);
	}
	header.training .inner {
		padding-top: 12px;
	}

	.clocks {
		display: flex;
		gap: 8px;
	}
	/*
	 * Sized to be read at arm's length, mid-set, without leaning in — these two
	 * numbers are the only reason the bar is pinned at all.
	 */
	.clock {
		flex: 1;
		min-width: 0;
		padding: 10px 16px 12px;
		border-radius: var(--radius-lg);
		background: var(--md-surface);
		color: var(--md-on-surface);
	}
	.rest {
		background: var(--md-tertiary-container);
		color: var(--md-on-tertiary-container);
	}
	.clock-label {
		opacity: 0.85;
	}
	.clock-value {
		font-family: var(--font-heading);
		font-size: var(--text-3xl);
		line-height: 44px;
	}
	/* A session past an hour reads h:mm:ss — seven characters. On the narrowest
	   phones that is wider than half the row, so the numerals give a little back. */
	@media (max-width: 380px) {
		.clock-value {
			font-size: 30px;
		}
	}

	/* M3 linear progress indicator: the fill and the track are separate
	   rounded segments with a gap between them. */
	.progress {
		margin-top: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.track {
		flex: 1;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--md-secondary-container);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--md-primary);
		border-radius: var(--radius-pill);
		transition: width 0.35s ease;
	}
	.progress-text {
		flex: none;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--md-on-surface-variant);
	}

	/*
	 * Desktop. The bar stays put while the page scrolls under it, which is what
	 * a window's title bar does, and it tightens: a 32px headline under 64px of
	 * air is sized for a phone held at arm's length.
	 */
	@media (min-width: 900px) and (pointer: fine) {
		header {
			position: sticky;
			top: 0;
			z-index: 30;
		}
		.bar {
			height: 52px;
		}
		.titles {
			padding: 0 0 14px;
		}
		.title {
			font-size: 28px;
			line-height: 36px;
		}
		.clock-value {
			font-size: 40px;
		}
	}
</style>
