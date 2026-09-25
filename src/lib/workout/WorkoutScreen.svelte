<script lang="ts">
	import { tick } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ExerciseCard from '$lib/workout/ExerciseCard.svelte';
	import {
		ADVANCE_DELAY_MS,
		ADVANCE_ON_COMMIT_MS,
		clock,
		movementsOf,
		stepAfterLog,
		warmupsOf,
		WorkoutSession,
		type Advance,
		type Logged,
		type SessionExercise
	} from '$lib/workout/session.svelte';
	import type { LoadingConfig } from '$lib/plates';
	import type { SessionSummary as SummaryView } from '$lib/server/sessions';
	import type { SessionInput } from '$lib/session-payload';
	import SessionSummary from './SessionSummary.svelte';
	import Fireworks from './Fireworks.svelte';
	import VolumeEquivalent from './VolumeEquivalent.svelte';
	import { useOffline } from '$lib/offline/context.svelte';
	import { clearLive, loadLive, saveLive } from '$lib/offline/live';
	import { useChrome } from '$lib/shell/chrome.svelte';
	import { setVolume, formatVolume, wholeMinutes } from '$lib/volume';

	type LastLog = { weight: number; reps: number; loggedAt: Date };

	type Props = {
		day: { id: string; key: string; title: string; exercises: SessionExercise[] };
		lastLogs: Record<string, LastLog>;
		config: LoadingConfig;
	};

	/**
	 * The parent keys this on the day id. The session is built once from props
	 * and then owns itself — finishing a day, going home and starting another
	 * would otherwise reuse this component, and with it the finished session.
	 */
	let { day, lastLogs, config }: Props = $props();

	const chrome = useChrome();
	const { store, queue } = useOffline();

	// svelte-ignore state_referenced_locally
	const session = new WorkoutSession(
		day.exercises.map((ex) => ({
			id: ex.id,
			sets: ex.sets,
			reps: ex.reps,
			note: ex.note,
			main: ex.main,
			pair: ex.pair,
			warmups: ex.warmups
		}))
	);

	/** Null until the saved session has been checked, so nothing is overwritten. */
	let restored = $state(false);
	/** Set while abandoning, so nothing writes the session back out. */
	let quitting = $state(false);

	/**
	 * Quitting is irreversible — the snapshot goes with it — and the button sits
	 * next to "Finish workout". So once anything has been logged it takes two
	 * taps, with the count of what is about to be lost written on it.
	 *
	 * It disarms on its own after a few seconds, and immediately if another set
	 * is logged: carrying on training is the clearest possible statement that
	 * the first tap was a mistake.
	 */
	const QUIT_CONFIRM_MS = 5000;
	let confirmQuit = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | null = null;

	function disarmQuit() {
		confirmQuit = false;
		if (confirmTimer !== null) clearTimeout(confirmTimer);
		confirmTimer = null;
	}

	function pressQuit() {
		if (session.loggedCount === 0 || confirmQuit) {
			disarmQuit();
			void quit();
			return;
		}
		confirmQuit = true;
		if (confirmTimer !== null) clearTimeout(confirmTimer);
		confirmTimer = setTimeout(() => (confirmQuit = false), QUIT_CONFIRM_MS);
	}

	/* Teardown for both pending timers, so neither outlives the screen. */
	$effect(() => () => {
		disarmQuit();
		cancelAdvance();
	});

	/**
	 * Picks up an interrupted workout. A refresh, a phone call, or iOS
	 * reclaiming a backgrounded tab all end the page; none of them should end
	 * the workout.
	 */
	$effect(() => {
		let cancelled = false;
		void loadLive(store, day.id).then((saved) => {
			if (cancelled) return;
			if (saved) session.adopt(saved);
			restored = true;
			// Arrived from the home screen's Resume button: pick up where it left
			// off, then drop the flag so a reload does not resume again.
			if (page.url.searchParams.has('resume')) {
				session.resume();
				replaceState(resolve('/workout/[id]', { id: day.id }), page.state);
			}
		});
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Writes the session after every change. Deliberately not debounced: the
	 * write is a few hundred bytes, and the moment worth surviving is the one
	 * right after a set is logged.
	 */
	$effect(() => {
		if (!restored || quitting || session.finishedAt) return;
		const snapshot = {
			sessionId: session.id,
			dayId: day.id,
			startedAt: session.startedAt,
			lastAt: session.lastAt,
			active: session.active,
			log: { ...session.log },
			pausedAt: session.pausedAt,
			pausedMs: session.pausedMs,
			exerciseIds: session.exercises.map((e) => e.id)
		};
		void saveLive(store, snapshot);
	});

	/** The clocks run off timestamps, so this only needs to nudge the view. */
	$effect(() => {
		const tick = setInterval(() => {
			session.now = Date.now();
		}, 1000);
		return () => clearInterval(tick);
	});

	// Feed the sticky header, and take it back down on the way out.
	$effect(() => {
		if (session.finishedAt) {
			chrome.clear();
			return;
		}
		chrome.sessionClock = clock(session.elapsedMs);
		chrome.restClock = clock(session.restMs);
		chrome.progress = session.progress;
		chrome.paused = session.paused;
	});
	/* Takes the clocks back down on the way out, however the screen is left. */
	$effect(() => () => chrome.clear());

	/**
	 * Keeps the screen awake while logging. The lock is dropped whenever the tab
	 * is hidden and does not return on its own, so it is re-taken on every
	 * visibility change rather than once at the start.
	 */
	$effect(() => {
		// Paused, the phone is allowed to sleep: that is the point of pausing.
		if (session.finishedAt || session.paused) return;
		let sentinel: WakeLockSentinel | null = null;
		let cancelled = false;

		const take = async () => {
			if (cancelled || document.visibilityState !== 'visible') return;
			try {
				sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
			} catch {
				// Unsupported, or refused on low battery. Not worth surfacing.
			}
		};

		void take();
		document.addEventListener('visibilitychange', take);
		return () => {
			cancelled = true;
			document.removeEventListener('visibilitychange', take);
			void sentinel?.release();
		};
	});

	let summary = $state<SummaryView | null>(null);
	let syncError = $state<string | null>(null);
	let saving = $state(false);

	/** Everything logged, in the shape the API accepts. */
	function buildPayload(): SessionInput {
		const logs: SessionInput['logs'] = [];
		session.exercises.forEach((exercise, exerciseIndex) => {
			// Warm-ups: the main movement, each at its own weight.
			warmupsOf(exercise).forEach((warmup, i) => {
				const reps = session.warmupReps(exerciseIndex, i);
				if (reps == null) return;
				logs.push({
					dayExerciseId: exercise.id,
					movementId: exercise.main.movementId,
					exerciseIndex,
					setIndex: i,
					slot: 0,
					warmup: true,
					tool: exercise.main.tool,
					weight: warmup.weight,
					reps,
					loggedAt: session.lastAt
				});
			});
			movementsOf(exercise).forEach((movement, slot) => {
				for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
					const reps = session.reps(exerciseIndex, setIndex, slot);
					if (reps == null) continue;
					logs.push({
						dayExerciseId: exercise.id,
						movementId: movement.movementId,
						exerciseIndex,
						setIndex,
						slot,
						tool: movement.tool,
						weight: movement.weight,
						reps,
						loggedAt: session.lastAt
					});
				}
			});
		});
		return {
			id: session.id,
			dayId: day.id,
			startedAt: session.startedAt,
			endedAt: session.finishedAt ?? Date.now(),
			pausedMs: session.pausedMs,
			logs
		};
	}

	/**
	 * Commits the workout. The session id was minted at the start, so a retry
	 * upserts rather than duplicating.
	 *
	 * A lapsed Access session is answered by Cloudflare with a redirect that
	 * fetch follows, so a 200 carrying HTML is an auth failure rather than a
	 * success — checking the content type is the only way to tell from here.
	 */
	async function commit() {
		if (saving) return;
		saving = true;
		syncError = null;

		const payload = buildPayload();

		// Durable first. Everything after this can fail without losing the
		// workout, which is the whole point of the queue.
		await queue.add(payload);
		await clearLive(store);

		try {
			const response = await fetch('/api/sessions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if ((response.headers.get('content-type') ?? '').includes('application/json')) {
				const body = await response.json();
				if (response.ok) summary = body.summary as SummaryView;
			}
		} catch {
			// The queue owns the retry; the screen just shows local numbers.
		} finally {
			saving = false;
			if (!summary) {
				syncError =
					queue.status === 'reauth'
						? 'Signed out while you were training. It is saved on this device and will send once you sign in.'
						: 'Saved on this device. It will reach the server on its own once you are back online.';
			}
		}
	}

	/**
	 * Throws the workout away.
	 *
	 * The snapshot in IndexedDB has to go with it. Leaving it behind meant
	 * coming back to this day silently resumed the abandoned session — same
	 * logged sets, and a session clock still counting from whenever you first
	 * started it.
	 */
	async function quit() {
		quitting = true;
		await clearLive(store);
		await goto(resolve('/'));
	}

	/**
	 * Stepping away mid-workout. The clocks stop, nothing moves on by itself,
	 * and the pause is saved with the rest of the session, so closing the app
	 * and coming back hours later still finds it paused.
	 */
	function pause() {
		disarmQuit();
		cancelAdvance();
		session.pause();
	}

	/*
	 * The kebab menu beside the day's title: Edit day, and Pause / Resume.
	 * Closes on a choice, on Escape, or on a tap anywhere else; the arrow keys
	 * move between its items, and focus goes back to the kebab on closing.
	 */
	let menuOpen = $state(false);
	let menuWrap = $state<HTMLElement>();
	let menu = $state<HTMLElement>();
	let kebab = $state<HTMLElement>();

	function menuItems(): HTMLElement[] {
		return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
	}

	function openMenu() {
		menuOpen = true;
		// Focus the first item once the menu has rendered.
		void tick().then(() => menuItems()[0]?.focus());
	}

	function closeMenu(returnFocus = true) {
		menuOpen = false;
		if (returnFocus) kebab?.focus();
	}

	function togglePause() {
		closeMenu();
		if (session.paused) session.resume();
		else pause();
	}

	function menuKeydown(event: KeyboardEvent) {
		const items = menuItems();
		const at = items.indexOf(document.activeElement as HTMLElement);
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			items[(at + step + items.length) % items.length]?.focus();
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
		} else if (event.key === 'Tab') {
			closeMenu(false);
		}
	}

	function finish() {
		if (session.finishedAt) return;
		session.finish();
		void commit();
	}

	/**
	 * One roll for the "That's 3 Cybertrucks!" card, shared by both screens that
	 * draw it — the on-device one and the server summary that replaces it — so
	 * they name the same thing. Timed from the moment the workout finished.
	 */
	const equivalentRoll = Math.random();
	const equivalent = $derived({
		roll: equivalentRoll,
		since: session.finishedAt ?? Date.now()
	});

	/**
	 * The Finish button. With every set logged it finishes; with any left, it
	 * asks first. The button sits right where a thumb lands when it misses a rep
	 * chip, and finishing early is not something the screen can take back.
	 * Finishing on its own after the last set never asks — by then nothing is
	 * missing.
	 */
	let confirmFinish = $state(false);
	const unlogged = $derived(session.totalSlots - session.loggedCount);

	function pressFinish() {
		if (session.complete) {
			finish();
			return;
		}
		disarmQuit();
		cancelAdvance();
		confirmFinish = true;
	}

	function finishAnyway() {
		confirmFinish = false;
		finish();
	}

	/** Focuses the safe choice as the prompt opens. */
	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	/**
	 * Advance past a finished exercise, and end the day when none are left.
	 *
	 * The move waits — how long depends on whether it was tapped or typed, see
	 * ADVANCE_DELAY_MS — and anything else you enter cancels it. Correcting a
	 * finished exercise never moves you at all; see stepAfterLog.
	 */
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;
	/** The move waiting to happen, kept so committing can bring it forward. */
	let pending: { index: number; step: Advance } | null = null;

	function cancelAdvance() {
		if (advanceTimer !== null) clearTimeout(advanceTimer);
		advanceTimer = null;
		pending = null;
	}

	function schedule(index: number, step: Advance, delay: number) {
		if (advanceTimer !== null) clearTimeout(advanceTimer);
		pending = { index, step };
		advanceTimer = setTimeout(applyPending, delay);
	}

	function applyPending() {
		const move = pending;
		cancelAdvance();
		if (!move) return;

		// Re-checked on the way out: the wait may have been spent undoing it, and
		// you may have tapped a different card in the meantime.
		if (!session.isExerciseDone(move.index) || session.active !== move.index) return;
		if (move.step.kind === 'finish') {
			finish();
			return;
		}
		session.active = move.step.index;
		scrollToExercise(move.step.index);
	}

	function afterLog(index: number, { completed, source }: Logged) {
		// Still training, so the pending discard was not meant.
		disarmQuit();
		// A move already waiting on this exercise means it was finished a keystroke
		// ago, so this write is the rest of that number rather than a correction to
		// a done exercise. Read before cancelling, and the wait starts again from
		// the digit that just landed.
		const waiting = pending?.index === index;
		cancelAdvance();

		const step = stepAfterLog(session, index, completed, waiting);
		if (step.kind === 'stay') return;
		schedule(index, step, ADVANCE_DELAY_MS[source]);
	}

	/**
	 * The lifter has finished entering a number — keypad dismissed, or focus
	 * gone. Brings a waiting move forward instead of sitting out the backstop,
	 * which is the difference between "it moves on when I am done" and "it does
	 * not move on at all".
	 */
	function afterCommit() {
		if (pending === null) return;
		schedule(pending.index, pending.step, ADVANCE_ON_COMMIT_MS);
	}

	function scrollToExercise(index: number) {
		setTimeout(() => {
			const el = document.querySelector(`[data-exercise="${index}"]`);
			if (!el) return;
			// Measured rather than a constant: the header is pinned while training,
			// so anything it covers is landed on but not visible, and how much it
			// covers depends on the safe-area inset and the window width. The
			// header's own bottom gap already separates the two, so only a
			// little more is added here.
			const header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
			const top = el.getBoundingClientRect().top + window.scrollY - header - 4;
			window.scrollTo({ top, behavior: 'smooth' });
		}, 80);
	}

	/** Volume actually logged, by the same rule the server will use. */
	const loggedVolume = $derived.by(() => {
		let total = 0;
		session.exercises.forEach((exercise, ei) => {
			// Warm-ups are weight lifted too.
			warmupsOf(exercise).forEach((warmup, i) => {
				const reps = session.warmupReps(ei, i);
				if (reps != null) total += setVolume({ ...exercise.main, weight: warmup.weight }, reps);
			});
			movementsOf(exercise).forEach((movement, slot) => {
				for (let si = 0; si < exercise.sets; si++) {
					const reps = session.reps(ei, si, slot);
					if (reps != null) total += setVolume(movement, reps);
				}
			});
		});
		return total;
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (menuOpen) closeMenu();
		else if (confirmFinish) confirmFinish = false;
	}}
	onpointerdown={(e) => {
		if (menuOpen && !menuWrap?.contains(e.target as Node)) closeMenu(false);
	}}
/>

{#if session.finishedAt}
	<!-- Outside the summary / pending switch below, so it plays once when the
	     workout ends and is not restarted when the server's answer arrives. -->
	<Fireworks />
	{#if summary}
		<SessionSummary {summary} {syncError} {equivalent} />
	{:else}
		<section class="pending">
			<div class="kicker">{day.key} day complete</div>
			<h2>{saving ? 'Saving…' : 'Saved on this device'}</h2>
			<p class="text-muted sub">
				{syncError ?? 'Sending this workout to the server.'}
			</p>
			<ul class="stats">
				<li>
					<div class="stat-label">Volume</div>
					<div class="stat-value num">
						{formatVolume(loggedVolume)}<span class="stat-unit">lb</span>
					</div>
				</li>
				<li>
					<div class="stat-label">Time</div>
					<div class="stat-value num">
						{wholeMinutes(session.durationMins)}<span class="stat-unit">min</span>
					</div>
				</li>
				<li>
					<div class="stat-label">Sets</div>
					<div class="stat-value num">{session.loggedCount}</div>
				</li>
			</ul>
			<VolumeEquivalent volume={loggedVolume} roll={equivalent.roll} since={equivalent.since} />
			<div class="pending-actions">
				<button class="btn btn-secondary" onclick={() => queue.drain()} disabled={saving}>
					Try now
				</button>
				<a class="btn btn-primary" href={resolve('/')}>Back to Up Next</a>
			</div>
		</section>
	{/if}
{:else}
	<div class="head">
		<div class="head-title">
			<h2>{day.key} day</h2>
			<span class="text-muted day-title">{day.title}</span>
		</div>
		<!--
			The day's rarer actions, behind a kebab at the end of the title's line:
			two labelled buttons beside a long day title had nowhere tidy to go.
		-->
		<div class="menu-wrap" bind:this={menuWrap}>
			<button
				type="button"
				class="btn btn-icon kebab"
				aria-label="Workout options"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-controls="workout-menu"
				bind:this={kebab}
				onclick={() => (menuOpen ? closeMenu() : openMenu())}
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<circle cx="12" cy="5" r="2" />
					<circle cx="12" cy="12" r="2" />
					<circle cx="12" cy="19" r="2" />
				</svg>
			</button>
			{#if menuOpen}
				<div
					class="menu"
					id="workout-menu"
					role="menu"
					aria-label="Workout options"
					tabindex="-1"
					bind:this={menu}
					onkeydown={menuKeydown}
				>
					<!--
						A link, not a button calling goto(): it opens in a new tab, it works
						before hydration, and leaving mid-workout is safe either way — the
						session is written to IndexedDB after every change, so coming back
						resumes it with the clock still running.
					-->
					<a
						class="menu-item"
						role="menuitem"
						href="{resolve('/routine/[id]', { id: day.id })}?back={encodeURIComponent(
							resolve('/workout/[id]', { id: day.id })
						)}"
						onclick={() => (menuOpen = false)}
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
							<path d="M13.5 6.5l4 4" />
						</svg>
						Edit day
					</a>
					<button type="button" class="menu-item" role="menuitem" onclick={togglePause}>
						{#if session.paused}
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M8 5.5v13l10-6.5z" />
							</svg>
							Resume workout
						{:else}
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
							</svg>
							Pause workout
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>

	{#if session.paused}
		<!-- In place of the button, at the top of the list: the first thing
		     seen on coming back. Logging a set resumes too. -->
		<div class="paused" role="status">
			<div class="paused-text">
				<span class="paused-title">Workout paused</span>
				<span class="paused-meta num">
					{clock(session.elapsedMs)} so far · the clocks are stopped
				</span>
			</div>
			<button type="button" class="btn btn-primary resume" onclick={() => session.resume()}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M8 5.5v13l10-6.5z" />
				</svg>
				Resume
			</button>
		</div>
	{/if}

	<ul class="cards">
		{#each session.exercises as exercise, index (exercise.id)}
			<ExerciseCard
				{session}
				{exercise}
				{index}
				{config}
				{lastLogs}
				onOpen={() => (session.active = index)}
				onLogged={(event) => afterLog(index, event)}
				onCommit={afterCommit}
			/>
		{/each}
	</ul>

	<!--
		The two ways a workout can end, after the last exercise and deliberately
		not pinned: a Finish button riding along at the bottom of the screen is
		one stray tap away all session. Finishing is the filled button and takes
		the width; quitting is a text button in the error color, well to its side.
	-->
	<div class="actions">
		<button
			class="btn act quit"
			class:btn-danger-quiet={!confirmQuit}
			class:btn-danger={confirmQuit}
			type="button"
			onclick={pressQuit}
			disabled={quitting}
		>
			{#if confirmQuit}
				Discard {session.loggedCount} set{session.loggedCount === 1 ? '' : 's'}?
			{:else}
				Quit
			{/if}
		</button>
		<button class="btn btn-primary act finish" onclick={pressFinish} disabled={saving}>
			{saving ? 'Saving…' : 'Finish workout'}
		</button>
	</div>

	{#if confirmFinish}
		<!--
			Markup order is keep-going → finish. On a phone the actions stack
			confirm-first, which leaves "Keep going" at the bottom: where the thumb
			that just hit Finish by mistake is most likely to land again.
		-->
		<div class="dialog-backdrop">
			<div
				class="dialog"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="finish-title"
				aria-describedby="finish-text"
			>
				<h2 class="dialog-title" id="finish-title">Finish with sets left?</h2>
				<p class="text-muted finish-text" id="finish-text">
					{unlogged} of {session.totalSlots} set{session.totalSlots === 1 ? '' : 's'}
					{unlogged === 1 ? 'is' : 'are'} not logged yet. Finishing now saves the workout without
					{unlogged === 1 ? 'it' : 'them'}.
				</p>
				<div class="dialog-actions">
					<button
						type="button"
						class="btn btn-secondary"
						onclick={() => (confirmFinish = false)}
						use:focusOnMount
					>
						Keep going
					</button>
					<button type="button" class="btn btn-primary" onclick={finishAnyway}>
						Finish anyway
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/*
	 * The title on the left, the kebab on the right of its first line. The row
	 * never wraps: a long day title wraps within itself, beside the kebab.
	 */
	.head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		/* No top padding: the pinned bar's own gap and the page's padding
		   already separate this from the clocks. */
		margin-bottom: 18px;
	}
	.head-title {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		column-gap: 10px;
	}
	/* The kebab sits at the end of the title's first line, its glyph on the
	   gutter rather than its 48px box. */
	.menu-wrap {
		position: relative;
		flex: none;
		align-self: flex-start;
		margin: -6px -12px 0 0;
	}
	.kebab {
		color: var(--md-on-surface);
	}
	/* An M3 menu: a raised surface of 48px rows with leading icons. */
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 8px;
		z-index: 25;
		min-width: 200px;
		padding: 8px 0;
		border-radius: var(--radius-sm);
		background: var(--md-surface-container);
		box-shadow: var(--shadow-md);
		transform-origin: top right;
		animation: menu-in 0.12s ease-out;
	}
	.menu:focus {
		outline: none;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 48px;
		padding: 0 16px 0 12px;
		border: 0;
		background: none;
		color: var(--md-on-surface);
		font: inherit;
		font-size: var(--text-md);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.menu-item svg {
		flex: none;
		color: var(--md-on-surface-variant);
	}
	.menu-item:hover,
	.menu-item:focus-visible {
		background: color-mix(in srgb, var(--md-on-surface) 8%, transparent);
		outline: none;
	}
	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.92);
		}
	}
	h2 {
		font-size: 28px;
		line-height: 36px;
		margin: 0;
	}
	.day-title {
		font-size: var(--text-md);
	}
	.paused {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
		padding: 12px 12px 12px 16px;
		border-radius: var(--radius-lg);
		color: var(--md-on-tertiary-container);
		background: var(--md-tertiary-container);
	}
	.paused-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.paused-title {
		font-size: var(--text-base);
		font-weight: 500;
	}
	.paused-meta {
		font-size: var(--text-sm);
	}
	.resume {
		flex: none;
	}

	.cards,
	.stats {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cards {
		display: grid;
		gap: 10px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 24px;
	}
	.act {
		/* "Discard 7 sets?" is longer than the label it replaces. */
		white-space: normal;
		line-height: 1.25;
	}
	.quit {
		flex: none;
		min-height: 48px;
	}
	.finish {
		flex: 1;
		min-height: 56px;
		border-radius: var(--radius-lg);
		font-size: var(--text-base);
	}

	@media (min-width: 900px) and (pointer: fine) {
		.actions {
			flex-direction: row-reverse;
			justify-content: flex-end;
		}
		.finish {
			flex: none;
			min-width: 200px;
		}
	}

	.finish-text {
		margin: 0;
		font-size: var(--text-md);
	}

	.pending {
		padding-top: 30px;
	}
	.pending-actions {
		display: flex;
		gap: 10px;
		margin-top: 24px;
	}
	.pending-actions .btn {
		text-decoration: none;
	}
	.kicker {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--md-primary);
		margin-bottom: 4px;
	}
	.pending h2 {
		font-size: var(--text-3xl);
		line-height: 44px;
		margin-bottom: 8px;
	}
	/* Same rhythm as the saved summary this screen turns into. */
	.sub {
		max-width: 48ch;
		margin: 0 0 12px;
	}
	/* The same filled tiles as the saved summary shows a moment later — this
	   screen is only up until the server answers, so the two must not jump. */
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-bottom: 12px;
	}
	.stats > li {
		min-width: 0;
		padding: 12px 14px;
		border-radius: var(--radius-md);
		background: var(--md-surface-container);
	}
	.stat-label {
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
	}
	/* A figure and its unit are one word, and the unit is small enough to cost
	   the column nothing. */
	.stat-value {
		font-family: var(--font-heading);
		font-size: clamp(20px, 6vw, 28px);
		line-height: 36px;
		white-space: nowrap;
	}
	.stat-unit {
		font-size: 0.55em;
		margin-left: 0.12em;
		color: var(--md-on-surface-variant);
	}
</style>
