<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
	import { useChrome } from './chrome.svelte';

	const chrome = useChrome();

	/**
	 * The title comes from route data rather than an effect. Effects do not run
	 * during SSR, so a header driven by one renders blank in the server HTML and
	 * only fills in after hydration — a visible flash on every single load.
	 *
	 * The clocks stay on `chrome`: those genuinely only exist once a workout is
	 * running in the browser.
	 */
	const header = $derived(
		(page.data.header ?? { kicker: '', title: '', back: null }) as {
			kicker: string;
			title: string;
			back?: string | null;
		}
	);

	const showClocks = $derived(chrome.sessionClock !== null);
	const progressPct = $derived(
		chrome.progress === null ? null : `${(chrome.progress * 100).toFixed(1)}%`
	);
</script>

<header class:training={showClocks}>
	<div class="inner">
		<div class="bar">
			{#if header.back}
				<!--
					Back is navigation, so it is a link: middle-click, long-press and
					"open in new tab" all work, and it needs no JavaScript. Callers put an
					already-resolved path into chrome.back, so resolve() here would be
					resolving a resolved path.
				-->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a class="round" href={header.back} aria-label="Back">
					<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
						<path
							d="M165.7 202.3a8 8 0 0 1-11.4 11.4l-80-80a8 8 0 0 1 0-11.4l80-80a8 8 0 0 1 11.4 11.4L91.3 128Z"
						/>
					</svg>
				</a>
			{/if}

			{#if showClocks}
				<!--
					Training. The clocks take the title's place in the row rather than
					sitting under it: stacked, this header ran to a third of a phone
					screen, and a bar that tall cannot be pinned without burying the
					sets you are trying to read. The day and its title are already the
					first thing on the page below, so nothing is lost by dropping them
					here.
				-->
				<div class="clocks">
					<div class="clock">
						<div class="label clock-label">Session</div>
						<div class="num clock-value">{chrome.sessionClock}</div>
					</div>
					<div class="clock rest">
						<div class="label clock-label rest-label">Resting</div>
						<div class="num clock-value rest-value">{chrome.restClock}</div>
					</div>
				</div>
			{:else}
				<div class="titles">
					{#if header.kicker}
						<div class="label kicker">{header.kicker}</div>
					{/if}
					<div class="title">{header.title}</div>
				</div>

				<!-- Off during a workout: the row has no width to spare, and the
				     theme is not something you change mid-set. -->
				<ThemeToggle />
			{/if}
		</div>

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
	/*
	 * The one surface that stays deep indigo in both themes. It is the app's own
	 * chrome, so its ink comes from the --on-section tokens rather than the page
	 * palette — those two grounds are independent once light mode exists.
	 */
	header {
		background: linear-gradient(160deg, var(--color-section-glow), var(--color-section) 62%);
		border-radius: 0 0 var(--radius-header) var(--radius-header);
		padding: calc(20px + env(safe-area-inset-top)) 0 22px;
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
		gap: 12px;
	}

	.round {
		flex: none;
		display: grid;
		text-decoration: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--on-section-fill);
		color: var(--on-section);
		cursor: pointer;
	}
	.round:hover {
		background: color-mix(in srgb, var(--on-section) 18%, transparent);
	}
	@media (pointer: coarse) {
		.round {
			width: 38px;
			height: 38px;
		}
	}

	.titles {
		flex: 1;
		min-width: 0;
	}
	.kicker {
		color: var(--on-section-accent);
	}
	.title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 27px;
		letter-spacing: -0.025em;
		line-height: 1.15;
		color: var(--on-section);
	}

	/*
	 * Training.
	 *
	 * The header stops being a title bar and becomes the instrument panel, so it
	 * is pinned: a session clock you have to scroll up to read is a clock you
	 * stop reading, and rest between sets is timed by the one number that goes
	 * off screen first. Everything here exists to keep that panel short enough
	 * to pin — the clocks share the title's row, the theme toggle steps out, and
	 * the block's own padding tightens.
	 */
	header.training {
		position: sticky;
		top: 0;
		z-index: 30;
		padding: calc(10px + env(safe-area-inset-top)) 0 11px;
	}

	.clocks {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 8px;
	}
	.clock {
		flex: 1;
		min-width: 0;
		background: var(--on-section-fill);
		border-radius: var(--radius-md);
		padding: 4px 11px 6px;
	}
	.rest {
		background: var(--on-section-fill-accent);
	}
	.clock-label {
		color: var(--on-section-dim);
	}
	.rest-label {
		color: var(--on-section-accent);
	}
	.clock-value {
		font-family: var(--font-heading);
		font-size: 21px;
		line-height: 1.15;
		color: var(--on-section);
	}
	/* Must not come from the page palette: accent-100 inverts to near-black in
	   light mode, and this sits on the header block, which never inverts. */
	.rest-value {
		color: var(--on-section);
	}

	.progress {
		margin-top: 10px;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.track {
		flex: 1;
		height: 7px;
		border-radius: var(--radius-pill);
		background: var(--on-section-track);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--on-section-accent);
		border-radius: var(--radius-pill);
		transition: width 0.35s ease;
	}
	.progress-text {
		flex: none;
		font-size: 11.5px;
		color: var(--on-section-accent);
	}

	/*
	 * Desktop. The block shrinks — 27px of title and 20px of air above it is
	 * sized for a phone held at arm's length — and it stays put while the page
	 * scrolls under it, which is what a window's title bar does. During a
	 * workout that keeps the clocks and the progress bar on screen for the whole
	 * session rather than only at the top of the page.
	 */
	@media (min-width: 900px) and (pointer: fine) {
		header {
			position: sticky;
			top: 0;
			z-index: 30;
			padding: 15px 0 17px;
		}
		.title {
			font-size: 23px;
		}
		/* The training bar is already compact, but a window has the width for
		   bigger numerals in it. */
		.clock-value {
			font-size: 24px;
		}
	}
</style>
