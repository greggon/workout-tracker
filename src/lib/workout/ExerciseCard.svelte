<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { loadingParts, type LoadingConfig } from '$lib/plates';
	import { TOOL_SPEC } from '$lib/types';
	import { formatWeight, relativeDay } from '$lib/volume';
	import PlateDiagram from './PlateDiagram.svelte';
	import {
		movementsOf,
		type LogSource,
		type Logged,
		type SessionExercise,
		type WorkoutSession
	} from './session.svelte';

	/** `loggedAt` survives the load boundary as a Date, not an epoch number. */
	type LastLog = { weight: number; reps: number; loggedAt: Date };

	type Props = {
		session: WorkoutSession;
		exercise: SessionExercise;
		index: number;
		config: LoadingConfig;
		lastLogs: Record<string, LastLog>;
		onOpen: () => void;
		/**
		 * Fired after any set changes. `completed` is true only when this write is
		 * what finished the exercise, so a later correction to a finished exercise
		 * does not read as finishing it again; `source` says whether that came
		 * from a tap or from a number still being typed.
		 */
		onLogged: (event: Logged) => void;
		/**
		 * Fired when the lifter is done entering a number — the keypad's Done key,
		 * or focus leaving the field. On a phone that is the real "I have finished
		 * this set" signal; the timer behind onLogged is only a backstop for when
		 * focus never leaves.
		 */
		onCommit: () => void;
	};

	let { session, exercise, index, config, lastLogs, onOpen, onLogged, onCommit }: Props = $props();

	const movements = $derived(movementsOf(exercise));
	const done = $derived(session.isExerciseDone(index));
	/*
	 * Open is "this is the exercise you are looking at", nothing more. It used to
	 * exclude finished exercises, which meant a completed card could not be
	 * reopened at all: tapping it set `active` and then refused to expand, so a
	 * mistyped rep count was permanent for the rest of the workout.
	 */
	const open = $derived(session.active === index);
	const loggedIn = $derived(session.loggedIn(index));
	const slotCount = $derived(exercise.sets * movements.length);

	const title = $derived(movements.map((m) => m.name).join('  →  '));
	const summary = $derived(
		`${exercise.sets} × ${exercise.reps} · ` +
			`${movements.map((m) => formatWeight(m.weight)).join(' / ')} lb · ` +
			movements.map((m) => TOOL_SPEC[m.tool].label.toLowerCase()).join(' / ')
	);

	const lastHint = $derived.by(() => {
		const last = lastLogs[exercise.main.movementId];
		if (!last) return 'first time';
		return `${formatWeight(last.weight)} lb × ${last.reps} (${relativeDay(last.loggedAt)})`;
	});

	const setIndexes = $derived([...Array(exercise.sets).keys()]);

	function record(setIndex: number, slot: number, reps: number | null, source: LogSource) {
		const wasDone = session.isExerciseDone(index);
		session.logSet(index, setIndex, slot, reps);
		onLogged({ completed: !wasDone && session.isExerciseDone(index), source });
	}

	function onReps(setIndex: number, slot: number, value: string) {
		const trimmed = value.trim();
		record(setIndex, slot, trimmed === '' ? null : Number(trimmed), 'typed');
	}
</script>

<li class="card-wrap" class:open class:done data-exercise={index}>
	<button class="head" type="button" onclick={onOpen} aria-expanded={open}>
		<span class="dot" class:dot-open={open} class:dot-done={done}>
			{done ? '✓' : index + 1}
		</span>
		<span class="head-text">
			<span class="name" class:struck={done && !open}>{title}</span>
			<span class="summary num">{summary}</span>
		</span>
		<span class="count num">{loggedIn}/{slotCount}</span>
	</button>

	{#if open}
		<div class="body">
			<div class="hints">
				<span class="hint-chip">Last time · {lastHint}</span>
				{#if exercise.note}
					<span class="tag tag-accent">{exercise.note}</span>
				{/if}
			</div>

			<div class="loads">
				<!--
					Keyed by position, not by movement id. The array is [main] or [main,
					pair], so position *is* the identity here — and a superset whose two
					halves resolve to the same movement (pairing a lift with itself)
					would produce two identical keys, which Svelte throws on in
					production as well as in dev.
				-->
				{#each movements as movement, slot (slot)}
					{@const load = loadingParts(movement.tool, movement.weight, config)}
					<div class="load">
						<div class="load-head">
							<div class="load-text">
								<div class="load-name">
									<span class="load-movement">{movement.name}</span>
									<span class="num load-total">- {load.total}</span>
								</div>
								{#if load.note}
									<!-- Only what the drawing cannot say. The plate list itself is
									     redundant beside a diagram with the numbers on it. -->
									<div class="load-note num">{load.note}</div>
								{/if}
							</div>
							<a
								class="btn btn-ghost history"
								href="{resolve('/movements/[id]', {
									id: movement.movementId
								})}?back={encodeURIComponent(page.url.pathname)}"
							>
								History
							</a>
						</div>
						<!-- The drawing gets the whole row: its plates now carry their own
						     numbers, and a number is only worth writing if it can be read. -->
						<span class="art">
							<PlateDiagram tool={movement.tool} weight={movement.weight} {config} />
						</span>
					</div>
				{/each}
			</div>

			<div class="sets">
				{#each setIndexes as setIndex (setIndex)}
					{@const setDone = movements.every((_, m) => session.reps(index, setIndex, m) != null)}
					<div class="set" class:set-done={setDone}>
						<div class="set-head">
							<span class="set-label">Set {setIndex + 1}</span>
							<span class="set-target num">{exercise.reps} reps</span>
						</div>

						{#each movements as movement, slot (slot)}
							{@const value = session.reps(index, setIndex, slot)}
							<div class="entry">
								{#if movements.length > 1}
									<!--
										Only a superset needs naming here: with one movement the card's
										own title already says it, and repeating it once per set is how
										"Low Incline Wide Grip Bench Press" ended up setting the width
										of the card. The weight is gone from here for the same reason:
										it is on the summary line and beside the diagram already.
									-->
									<span class="entry-name">{movement.name}</span>
								{:else}
									<span class="entry-name"></span>
								{/if}
								<input
									class="input num entry-reps"
									class:logged={value != null && value !== exercise.reps}
									type="number"
									inputmode="numeric"
									min="0"
									placeholder={String(exercise.reps)}
									value={value ?? ''}
									oninput={(e) => onReps(setIndex, slot, e.currentTarget.value)}
									onblur={onCommit}
									onkeydown={(e) => {
										// Enter, and the numeric keypad's Done, mean the number is
										// finished. Blurring closes the keypad and commits through
										// the same path as tapping away.
										if (e.key === 'Enter') e.currentTarget.blur();
									}}
									aria-label="Reps completed, {movement.name}, set {setIndex + 1}"
								/>
								<button
									type="button"
									class="btn check"
									class:checked={value === exercise.reps}
									onclick={() => record(setIndex, slot, exercise.reps, 'check')}
									title="Hit all {exercise.reps} reps"
									aria-label="Hit all {exercise.reps} reps, {movement.name}, set {setIndex + 1}"
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
									>
										<path d="m5 13 5 5L20 7" />
									</svg>
								</button>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</li>

<style>
	.card-wrap {
		border-radius: var(--radius-lg);
		box-shadow: inset 0 0 0 1px var(--color-divider);
		transition:
			opacity 0.3s ease,
			background 0.3s ease;
	}
	.card-wrap.open {
		background: var(--color-surface);
		/* Not a literal black shadow: at 45% it is invisible on a dark ground
		   and a bruise on a light one. */
		box-shadow:
			inset 0 0 0 1px var(--color-accent-600),
			var(--shadow-md);
	}
	.card-wrap.done {
		opacity: 0.55;
	}
	/* Faded while it sits there finished, full strength while you are correcting
	   it — dimmed inputs are exactly what you do not want to read when fixing a
	   number you got wrong. */
	.card-wrap.done.open {
		opacity: 1;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px 16px;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.dot {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		font-family: var(--font-heading);
		font-size: 16px;
		color: var(--color-neutral-300);
		background: var(--color-neutral-900);
	}
	.dot-open {
		color: var(--color-accent-200);
		background: var(--color-accent-800);
		box-shadow: inset 0 0 0 1px var(--color-accent-600);
	}
	.dot-done {
		color: var(--color-accent-400);
	}

	.head-text {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 16.5px;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.struck {
		text-decoration: line-through;
		color: var(--color-neutral-500);
	}
	.summary {
		display: block;
		font-size: 12.5px;
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
	.count {
		flex: none;
		font-size: 11.5px;
		color: var(--color-neutral-600);
	}

	.body {
		padding: 0 16px 16px;
		display: grid;
		gap: 14px;
	}

	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.hint-chip {
		font-size: 11px;
		color: var(--color-neutral-400);
		background: var(--color-neutral-900);
		border-radius: 5px;
		padding: 4px 9px;
	}

	.loads {
		display: grid;
		gap: 10px;
	}
	.load {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.load-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		min-width: 0;
	}
	/*
	 * Small, and against the left edge with everything else in the card. At full
	 * width it dominated the row — and there are two of these in a superset —
	 * while all it has to do is show the shape of the stack and the number on
	 * each plate.
	 */
	.art {
		display: block;
		width: 100%;
		max-width: 150px;
	}
	.load-text {
		min-width: 0;
	}
	/*
	 * One line, always.
	 *
	 * The weight is the half worth protecting: wrapping it put the "lb" on a
	 * line of its own under the name. So the total never breaks and never
	 * shrinks, and the name gives way to an ellipsis instead — it is printed in
	 * full as the card's title two rows up, so nothing is actually lost here.
	 */
	.load-name {
		display: flex;
		align-items: baseline;
		gap: 5px;
		min-width: 0;
		font-size: 13.5px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		color: var(--color-neutral-400);
	}
	.load-movement {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The movement's total, alongside its name. Full ink, but no heavier than the
	   name it sits with — the drawing below is what carries the emphasis. */
	.load-total {
		flex: none;
		white-space: nowrap;
		color: var(--color-text);
	}
	/* What the drawing cannot say: "per side", "bar only", "2.5 lb short". */
	.load-note {
		font-size: 11.5px;
		color: var(--color-neutral-500);
		margin-top: 1px;
	}
	/* Safe to leave mid-workout: the session is on the device, and coming back
	   restores it exactly where it was. */
	.history {
		flex: none;
		margin-left: auto;
		font-size: 11.5px;
		text-decoration: none;
	}

	.sets {
		display: grid;
		gap: 8px;
	}
	.set {
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--color-neutral-900) 60%, transparent);
		padding: 8px 10px;
		display: grid;
		gap: 6px;
	}
	.set-done {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--color-divider);
	}
	.set-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.set-label {
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-neutral-400);
		margin-right: auto;
	}
	.set-target {
		font-size: 11px;
		color: var(--color-neutral-600);
	}

	/*
	 * The two controls are the same size on purpose: they are alternatives, and
	 * both are aimed at with a thumb between sets. One height for both, sized up
	 * on touch — 38px was under the 44px everything else in a workout gets.
	 */
	.entry {
		display: flex;
		align-items: center;
		gap: 8px;
		/* A grid item takes its content as its automatic minimum; this says the
		   row may be as narrow as the track it sits in. */
		min-width: 0;
		--entry-h: 40px;
		--entry-w: 72px;
	}
	@media (pointer: coarse) {
		.entry {
			--entry-h: 48px;
		}
	}
	/*
	 * Wraps rather than truncating.
	 *
	 * It was a single nowrap line with an ellipsis, which is only as good as the
	 * shrinking working — and on a phone a long name was pushing this row, and
	 * with it the whole card, past the width of the page. Wrapping text has a
	 * min-content width of its longest word, and `anywhere` drops even that to a
	 * single character, so nothing in this row can force it wider than the space
	 * it is given. A name that needs two lines gets two lines.
	 */
	.entry-name {
		flex: 1;
		min-width: 0;
		font-size: 13.5px;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.entry-reps {
		flex: none;
		width: var(--entry-w);
		height: var(--entry-h);
		text-align: center;
	}
	/*
	 * A logged set always shows in exactly one place: here when the number is off
	 * target, and on the check when it is not. Lighting both — which is what
	 * tapping the check did, since it fills the field with the target — said the
	 * same thing twice and read as two separate states.
	 */
	.entry-reps.logged {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.check {
		flex: none;
		width: var(--entry-w);
		height: var(--entry-h);
		border-color: var(--color-divider);
		color: var(--color-neutral-500);
	}
	/* Filled at the prescribed reps, however they got there — typed or tapped. */
	.check.checked {
		color: var(--color-accent);
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
</style>
