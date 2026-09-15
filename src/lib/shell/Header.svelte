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
	 * The clocks and the gear stay on `chrome`: those genuinely only exist once
	 * a workout is running in the browser.
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

<header>
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

			<div class="titles">
				{#if header.kicker}
					<div class="label kicker">{header.kicker}</div>
				{/if}
				<div class="title">{header.title}</div>
			</div>

			<ThemeToggle />

			{#if chrome.onGear}
				<button class="round gear" type="button" onclick={chrome.onGear} aria-label="Edit routine">
					<svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
						<path
							d="M128 80a48 48 0 1 0 48 48 48.05 48.05 0 0 0-48-48Zm0 80a32 32 0 1 1 32-32 32 32 0 0 1-32 32Zm88-29.84q.06-2.16 0-4.32l14.92-18.64a8 8 0 0 0 1.48-7.06 107.21 107.21 0 0 0-10.88-26.25 8 8 0 0 0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186 40.54a8 8 0 0 0-3.94-6 107.71 107.71 0 0 0-26.25-10.87 8 8 0 0 0-7.06 1.49L130.16 40Q128 40 125.84 40L107.2 25.11a8 8 0 0 0-7.06-1.48A107.6 107.6 0 0 0 73.89 34.51a8 8 0 0 0-3.93 6L67.32 64.27q-1.56 1.49-3 3L40.54 70a8 8 0 0 0-6 3.94 107.71 107.71 0 0 0-10.87 26.25 8 8 0 0 0 1.49 7.06L40 125.84Q40 128 40 130.16L25.11 148.8a8 8 0 0 0-1.48 7.06 107.21 107.21 0 0 0 10.88 26.25 8 8 0 0 0 6 3.93l23.72 2.64q1.49 1.56 3 3L70 215.46a8 8 0 0 0 3.94 6 107.71 107.71 0 0 0 26.25 10.87 8 8 0 0 0 7.06-1.49L125.84 216q2.16.06 4.32 0l18.64 14.92a8 8 0 0 0 7.06 1.48 107.21 107.21 0 0 0 26.25-10.88 8 8 0 0 0 3.93-6l2.64-23.72q1.56-1.48 3-3L215.46 186a8 8 0 0 0 6-3.94 107.71 107.71 0 0 0 10.87-26.25 8 8 0 0 0-1.49-7.06Z"
						/>
					</svg>
				</button>
			{/if}
		</div>

		{#if showClocks}
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
		padding: 0 20px;
		padding-left: max(20px, env(safe-area-inset-left));
		padding-right: max(20px, env(safe-area-inset-right));
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
	.gear {
		width: 38px;
		height: 38px;
	}
	@media (pointer: coarse) {
		.round {
			width: 38px;
			height: 38px;
		}
		.gear {
			width: 44px;
			height: 44px;
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

	.clocks {
		display: flex;
		gap: 10px;
		margin-top: 18px;
	}
	.clock {
		flex: 1;
		background: var(--on-section-fill);
		border-radius: var(--radius-md);
		padding: 11px 14px;
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
		font-size: 28px;
		line-height: 1.15;
		color: var(--on-section);
	}
	/* Must not come from the page palette: accent-100 inverts to near-black in
	   light mode, and this sits on the header block, which never inverts. */
	.rest-value {
		color: var(--on-section);
	}

	.progress {
		margin-top: 14px;
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
</style>
