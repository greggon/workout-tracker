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
	import type { SessionSummary as SummaryView } from '$lib/server/sessions';
	import type { SessionInput } from '$lib/session-payload';
	import SessionSummary from './SessionSummary.svelte';
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

		try {
			const response = await fetch('/api/sessions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(buildPayload())
			});

			const contentType = response.headers.get('content-type') ?? '';
			if (!contentType.includes('application/json')) {
				syncError =
					'Signed out while you were training. The workout is still on this device — sign in again and it will save.';
				return;
			}

			const body = await response.json();
			if (!response.ok) {
				syncError = `Could not save: ${body.error ?? response.status}`;
				return;
			}
			summary = body.summary as SummaryView;
		} catch {
			syncError =
				'No connection, so this is not saved yet. Keep this screen open until you are back online.';
		} finally {
			saving = false;
		}
	}

	function finish() {
		if (session.finishedAt) return;
		session.finish();
		void commit();
	}

	/** Advance past a finished exercise, and end the day when none are left. */
	function afterLog(index: number) {
		if (!session.isExerciseDone(index)) return;

		const next = session.nextUnfinished(index);
		if (next === null) {
			setTimeout(finish, 450);
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
	{#if summary}
		<SessionSummary {summary} {syncError} />
	{:else}
		<section class="pending">
			<div class="kicker">{day.key} day complete</div>
			<h2>{saving ? 'Saving…' : 'Not saved'}</h2>
			<p class="text-muted sub">
				{syncError ?? 'Sending this workout to the server.'}
			</p>
			<ul class="stats">
				<li>
					<div class="stat-label">Volume</div>
					<div class="stat-value num">{formatVolume(loggedVolume)} lb</div>
				</li>
				<li>
					<div class="stat-label">Time</div>
					<div class="stat-value num">{formatMinutes(session.durationMins)}</div>
				</li>
				<li>
					<div class="stat-label">Sets</div>
					<div class="stat-value num">{session.loggedCount}</div>
				</li>
			</ul>
			{#if syncError}
				<button class="btn btn-primary" onclick={commit} disabled={saving}>Try again</button>
			{/if}
		</section>
	{/if}
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
		<button class="btn btn-primary" onclick={finish} disabled={saving}>
			{saving ? 'Saving…' : 'Finish workout'}
		</button>
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

	.pending {
		padding-top: 30px;
	}
	.kicker {
		font-size: 9.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 6px;
	}
	.pending h2 {
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
</style>
