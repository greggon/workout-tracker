<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ExerciseCard from '$lib/workout/ExerciseCard.svelte';
	import {
		clock,
		movementsOf,
		WorkoutSession,
		type SessionExercise
	} from '$lib/workout/session.svelte';
	import type { LoadingConfig } from '$lib/plates';
	import { useChrome } from '$lib/shell/chrome.svelte';
	import { setVolume, formatVolume, formatMinutes } from '$lib/volume';

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
	$effect(() => {
		chrome.onEdit = () => goto(resolve('/routine/[id]', { id: day.id }));
		return () => chrome.clear();
	});

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

	/** Advance past a finished exercise, and end the day when none are left. */
	function afterLog(index: number) {
		if (!session.isExerciseDone(index)) return;

		const next = session.nextUnfinished(index);
		if (next === null) {
			setTimeout(() => session.finish(), 450);
			return;
		}
		session.active = next;
		scrollToExercise(next);
	}

	function scrollToExercise(index: number) {
		setTimeout(() => {
			const el = document.querySelector(`[data-exercise="${index}"]`);
			if (!el) return;
			const top = el.getBoundingClientRect().top + window.scrollY - 110;
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
	<section class="done">
		<div class="kicker">Day complete</div>
		<h2>{day.key} day, done</h2>
		<p class="text-muted sub">
			Logged {session.loggedCount} of {session.totalSlots} sets in {formatMinutes(
				session.durationMins
			)}.
		</p>

		<ul class="stats">
			<li class="stat">
				<div class="stat-label">Volume</div>
				<div class="stat-value num">{formatVolume(loggedVolume)} lb</div>
			</li>
			<li class="stat">
				<div class="stat-label">Time</div>
				<div class="stat-value num">{formatMinutes(session.durationMins)}</div>
			</li>
			<li class="stat">
				<div class="stat-label">Sets</div>
				<div class="stat-value num">{session.loggedCount}</div>
			</li>
		</ul>

		<p class="notice">
			Not saved yet — sessions start reaching the database in the next step. This screen becomes the
			real summary then.
		</p>

		<a class="btn btn-primary" href={resolve('/')}>Back to my days</a>
	</section>
{:else}
	<div class="head">
		<h2>{day.key} day</h2>
		<span class="text-muted day-title">{day.title}</span>
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
				onLogged={() => afterLog(index)}
			/>
		{/each}
	</ul>

	<div class="actions">
		<button class="btn btn-primary" onclick={() => session.finish()}>Finish workout</button>
		<a class="btn btn-secondary" href={resolve('/')}>Quit without saving</a>
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
		font-size: 30px;
		letter-spacing: -0.025em;
		margin: 0;
	}
	.day-title {
		font-size: 12.5px;
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
		gap: 10px;
		margin-top: 26px;
	}
	.actions .btn {
		text-decoration: none;
	}

	.done {
		padding-top: 30px;
	}
	.kicker {
		font-size: 9.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 6px;
	}
	.done h2 {
		font-size: 40px;
		letter-spacing: -0.03em;
		margin-bottom: 8px;
	}
	.sub {
		max-width: 48ch;
		margin: 0 0 26px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 14px;
		margin-bottom: 22px;
	}
	.stat-label {
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-500);
	}
	.stat-value {
		font-family: var(--font-heading);
		font-size: 28px;
		line-height: 1.15;
	}
	.notice {
		font-size: 12.5px;
		color: var(--color-neutral-400);
		background: var(--color-neutral-900);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		margin-bottom: 22px;
		max-width: 52ch;
	}
</style>
