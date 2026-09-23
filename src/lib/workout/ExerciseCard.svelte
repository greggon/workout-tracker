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
				<span class="tag tag-accent">Last time · {lastHint}</span>
				{#if exercise.note}
					<span class="tag tag-outline">{exercise.note}</span>
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
								href="{resolve('/history/[id]', {
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
					<div class="set">
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
										width="22"
										height="22"
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
	/*
	 * Closed, an exercise is a list row. Open, it is a filled card whose header
	 * row sits on a primary-container strip — the same colored-header card as
	 * Up Next, one tone down, so "the thing you are doing now" reads the same
	 * way on both screens. No outline and no shadow: the tones separate it.
	 */
	.card-wrap {
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition: background 0.3s ease;
	}
	.card-wrap.open {
		background: var(--md-surface-container);
	}
	.open .head {
		padding-block: 12px;
		color: var(--md-on-primary-container);
		background: var(--md-primary-container);
	}
	.open .summary,
	.open .count {
		color: var(--md-on-primary-container);
	}
	/* Finished and closed: the row steps back in ink rather than fading as a
	   whole, so the check on its avatar stays at full strength. */
	.card-wrap.done:not(.open) .name,
	.card-wrap.done:not(.open) .summary {
		color: var(--md-on-surface-variant);
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
		/* The shared list avatar; see .badge. */
		width: 40px;
		height: 40px;
		border-radius: var(--radius-pill);
		display: grid;
		place-items: center;
		font-size: 16px;
		font-weight: 500;
		color: var(--md-on-secondary-container);
		background: var(--md-secondary-container);
	}
	/* On the primary-container strip, the avatar takes the full primary. */
	.dot-open {
		color: var(--md-on-primary);
		background: var(--md-primary);
	}
	.dot-done {
		color: var(--md-on-primary);
		background: var(--md-primary);
	}

	.head-text {
		flex: 1;
		min-width: 0;
	}
	.name {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.struck {
		text-decoration: line-through;
		color: var(--color-neutral-500);
	}
	.summary {
		display: block;
		font-size: var(--text-sm);
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
	.count {
		flex: none;
		font-size: var(--text-sm);
		color: var(--color-neutral-500);
	}

	.body {
		padding: 12px 16px 16px;
		display: grid;
		gap: 14px;
	}

	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
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
		font-size: var(--text-md);
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		color: var(--color-text);
	}
	.load-movement {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The movement's total reads as part of its name, so it takes the same ink
	   and the same weight; the drawing below is what carries the emphasis. */
	.load-total {
		flex: none;
		white-space: nowrap;
	}
	/* What the drawing cannot say: "per side", "bar only", "2.5 lb short". */
	.load-note {
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
		margin-top: 1px;
	}
	/* Safe to leave mid-workout: the session is on the device, and coming back
	   restores it exactly where it was. */
	.history {
		flex: none;
		margin-left: auto;
		font-size: var(--text-md);
		text-decoration: none;
	}

	.sets {
		display: grid;
		gap: 8px;
	}
	/* Sets sit straight on the card's fill; the check buttons carry which are
	   done, so the rows themselves need no box. */
	.set {
		display: grid;
		gap: 8px;
	}
	.set-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.set-label {
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--md-on-surface);
		margin-right: auto;
	}
	.set-target {
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
	}

	/*
	 * The two controls are the same size on purpose: they are alternatives, and
	 * both are aimed at with a thumb between sets. One height for both: M3's
	 * 56px text field on touch, 48px with a pointer.
	 */
	.entry {
		display: flex;
		align-items: center;
		gap: 8px;
		/* A grid item takes its content as its automatic minimum; this says the
		   row may be as narrow as the track it sits in. */
		min-width: 0;
		--entry-h: 48px;
		--entry-w: 88px;
	}
	@media (pointer: coarse) {
		.entry {
			--entry-h: 56px;
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
		font-size: var(--text-md);
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	/* The field takes the page's surface so it reads as a place to type on
	   the card's grey. */
	.entry-reps {
		flex: none;
		width: var(--entry-w);
		height: var(--entry-h);
		text-align: center;
		background: var(--md-surface);
	}
	/*
	 * A logged set always shows in exactly one place: here when the number is off
	 * target, and on the check when it is not. Lighting both — which is what
	 * tapping the check did, since it fills the field with the target — said the
	 * same thing twice and read as two separate states.
	 */
	.entry-reps.logged {
		border-color: var(--md-primary);
		box-shadow: inset 0 0 0 1px var(--md-primary);
		background: color-mix(in srgb, var(--md-primary) 8%, transparent);
	}

	/* An M3 filled tonal icon button, round, that fills with the primary once
	   the set is at its prescribed reps. */
	.check {
		flex: none;
		width: var(--entry-h);
		height: var(--entry-h);
		padding: 0;
		color: var(--md-on-secondary-container);
		background: var(--md-secondary-container);
	}
	/* Filled at the prescribed reps, however they got there — typed or tapped. */
	.check.checked {
		color: var(--md-on-primary);
		background: var(--md-primary);
	}
</style>
