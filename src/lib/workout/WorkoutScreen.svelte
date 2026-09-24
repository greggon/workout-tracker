<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ExerciseCard from '$lib/workout/ExerciseCard.svelte';
	import {
		ADVANCE_DELAY_MS,
		ADVANCE_ON_COMMIT_MS,
		clock,
		movementsOf,
		stepAfterLog,
		WorkoutSession,
		type Advance,
		type Logged,
		type SessionExercise
	} from '$lib/workout/session.svelte';
	import type { LoadingConfig } from '$lib/plates';
	import type { SessionSummary as SummaryView } from '$lib/server/sessions';
	import type { SessionInput } from '$lib/session-payload';
	import SessionSummary from './SessionSummary.svelte';
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
			pair: ex.pair
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
			if (cancelled || !saved) {
				restored = true;
				return;
			}
			session.adopt(saved);
			restored = true;
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
			log: { ...session.log }
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
	});
	/* Takes the clocks back down on the way out, however the screen is left. */
	$effect(() => () => chrome.clear());

	/**
	 * Keeps the screen awake while logging. The lock is dropped whenever the tab
	 * is hidden and does not return on its own, so it is re-taken on every
	 * visibility change rather than once at the start.
	 */
	$effect(() => {
		if (session.finishedAt) return;
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

	function finish() {
		if (session.finishedAt) return;
		session.finish();
		void commit();
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

{#if session.finishedAt}
	{#if summary}
		<SessionSummary {summary} {syncError} />
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
		<h2>{day.key} day</h2>
		<span class="text-muted day-title">{day.title}</span>
		<!--
			A link, not a button calling goto(): it opens in a new tab, it works
			before hydration, and leaving mid-workout is safe either way — the
			session is written to IndexedDB after every change, so coming back
			resumes it with the clock still running.
		-->
		<a class="btn btn-secondary edit" href={resolve('/routine/[id]', { id: day.id })}>
			<svg
				width="15"
				height="15"
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
	</div>

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
		<button class="btn btn-primary act finish" onclick={finish} disabled={saving}>
			{saving ? 'Saving…' : 'Finish workout'}
		</button>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
		padding-top: 18px;
		margin-bottom: 18px;
	}
	h2 {
		font-size: 28px;
		line-height: 36px;
		margin: 0;
	}
	.day-title {
		font-size: var(--text-md);
	}
	/* Pushed to the end of the row: it is the one thing here you are not
	   reading, so it should not sit between the day and its title. */
	.edit {
		margin-left: auto;
		align-self: center;
		font-size: var(--text-md);
		text-decoration: none;
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

	.pending {
		padding-top: 30px;
	}
	.pending-actions {
		display: flex;
		gap: 10px;
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
		margin-bottom: 24px;
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
