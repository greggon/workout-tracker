<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { loadingParts, type LoadingConfig } from '$lib/plates';
	import { TOOL_SPEC } from '$lib/types';
	import { formatWeight, relativeDay } from '$lib/volume';
	import PlateDiagram from './PlateDiagram.svelte';
	import RepChip from './RepChip.svelte';
	import {
		movementsOf,
		warmupsOf,
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
		 * from a tap or from a typed number.
		 */
		onLogged: (event: Logged) => void;
		/**
		 * Fired when the lifter is done typing a number — the keypad's Done key,
		 * or focus leaving the field. On a phone that is the real "I have finished
		 * this set" signal; the timer behind onLogged is only a backstop.
		 */
		onCommit: () => void;
	};

	let { session, exercise, index, config, lastLogs, onOpen, onLogged, onCommit }: Props = $props();

	const movements = $derived(movementsOf(exercise));
	const paired = $derived(movements.length > 1);
	const done = $derived(session.isExerciseDone(index));
	/*
	 * Open is "this is the exercise you are looking at", nothing more — a
	 * finished card can be reopened to fix a number.
	 */
	const open = $derived(session.active === index);
	const loggedIn = $derived(session.loggedIn(index));
	const slotCount = $derived(exercise.sets * movements.length);

	/*
	 * Warm-ups, when the exercise has any: a row of their own before the
	 * working sets, each chip with its weight under it. Once all are logged
	 * they fold into one line, which can be opened again to correct one.
	 */
	const warmups = $derived(warmupsOf(exercise));
	const warmupsLogged = $derived(session.warmupsLoggedIn(index));
	const warmupsDone = $derived(warmups.length > 0 && warmupsLogged === warmups.length);
	let warmupsOpen = $state(false);
	/** The first set still to do; its weight is what the diagram shows. */
	const next = $derived(session.nextSet(index));
	const warmupSummary = $derived(
		warmups.map((w, i) => `${formatWeight(w.weight)}×${session.warmupReps(index, i)}`).join(' · ')
	);
	/** Warm-up progress until the working sets start, then the working count. */
	const countText = $derived(
		warmups.length && loggedIn === 0 && !warmupsDone
			? `${warmupsLogged}/${warmups.length} warm-up`
			: `${loggedIn}/${slotCount}`
	);
	const setIndexes = $derived([...Array(exercise.sets).keys()]);

	const title = $derived(movements.map((m) => m.name).join('  →  '));

	/** A letter per half of a superset: A for the main lift, B for its pair. */
	const letter = (slot: number) => String.fromCharCode(65 + slot);

	/**
	 * Under the title. Open, the prescription; closed with sets logged, what was
	 * actually done ("A 10 10 9  B 10 – –"), so a finished exercise can be read
	 * back without opening it.
	 */
	const summary = $derived.by(() => {
		if (open || loggedIn === 0) {
			return (
				`${paired ? 'Superset · ' : ''}${warmups.length ? `${warmups.length} warm-up · ` : ''}` +
				`${exercise.sets} × ${exercise.reps} · ` +
				`${movements.map((m) => formatWeight(m.weight)).join(' / ')} lb · ` +
				movements.map((m) => TOOL_SPEC[m.tool].label.toLowerCase()).join(' / ')
			);
		}
		return movements
			.map((_, slot) => {
				const reps = setIndexes.map((s) => session.reps(index, s, slot) ?? '–').join(' ');
				return paired ? `${letter(slot)} ${reps}` : reps;
			})
			.join('   ');
	});

	function lastFor(movementId: string): string | null {
		const last = lastLogs[movementId];
		if (!last) return null;
		return `${formatWeight(last.weight)} × ${last.reps}, ${relativeDay(last.loggedAt)}`;
	}

	/** A warm-up never finishes an exercise, so it can never move the screen on. */
	function recordWarmup(i: number, reps: number | null, source: LogSource) {
		session.logWarmup(index, i, reps);
		onLogged({ completed: false, source });
	}

	function record(setIndex: number, slot: number, reps: number | null, source: LogSource) {
		const wasDone = session.isExerciseDone(index);
		session.logSet(index, setIndex, slot, reps);
		onLogged({ completed: !wasDone && session.isExerciseDone(index), source });
	}
</script>

<li class="card-wrap" class:open class:done data-exercise={index}>
	<button class="head" type="button" onclick={onOpen} aria-expanded={open}>
		<span class="dot" class:dot-open={open} class:dot-done={done}>
			{done ? '✓' : index + 1}
		</span>
		<span class="head-text">
			<span class="name">{title}</span>
			<span class="summary num">{summary}</span>
		</span>
		<span class="count num">{countText}</span>
	</button>

	{#if open}
		<div class="body">
			{#if exercise.note}
				<span class="tag tag-outline note">{exercise.note}</span>
			{/if}

			<!--
				Keyed by position, not by movement id. The array is [main] or [main,
				pair], so position *is* the identity here — and a superset whose two
				halves resolve to the same movement would produce two identical keys,
				which Svelte throws on.
			-->
			{#each movements as movement, slot (slot)}
				{@const load = loadingParts(movement.tool, movement.weight, config)}
				{@const last = lastFor(movement.movementId)}
				<!-- The diagram shows the weight to load now: the next warm-up's,
				     until they are done. -->
				{@const warming = slot === 0 && next?.kind === 'warmup'}
				{@const loadWeight = warming && next?.kind === 'warmup' ? next.weight : movement.weight}
				{@const nextLoad = loadingParts(movement.tool, loadWeight, config)}
				<div class="movement">
					<div class="mv-head">
						{#if paired}
							<span class="letter" aria-hidden="true">{letter(slot)}</span>
						{/if}
						<div class="mv-text">
							<!-- The name is the way to its history: safe to leave mid-workout,
							     the session is on the device and resumes where it was. -->
							<a
								class="mv-name"
								href="{resolve('/history/[id]', {
									id: movement.movementId
								})}?back={encodeURIComponent(page.url.pathname)}"
							>
								{#if paired}<span class="visually-hidden"
										>{letter(slot)}:
									</span>{/if}{movement.name}
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"
								>
									<path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
								</svg>
							</a>
							<span class="mv-meta num">
								{load.total}{load.note ? ` · ${load.note}` : ''}{last ? ` · Last ${last}` : ''}
							</span>
						</div>
						<span class="art" class:with-next={warmups.length > 0 && slot === 0}>
							{#if warmups.length > 0 && slot === 0}
								<span class="next-label num">Next · {nextLoad.total}</span>
							{/if}
							<PlateDiagram tool={movement.tool} weight={loadWeight} {config} />
							{#if warmups.length > 0 && slot === 0 && nextLoad.note}
								<span class="next-note num">{nextLoad.note}</span>
							{/if}
						</span>
					</div>

					{#if slot === 0 && warmups.length > 0}
						{#if warmupsDone && !warmupsOpen}
							<button
								type="button"
								class="warmups-done num"
								aria-expanded="false"
								onclick={() => (warmupsOpen = true)}
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.6"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="m5 13 5 5L20 7" />
								</svg>
								<span>Warm-up done · {warmupSummary}</span>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="m6 9 6 6 6-6" />
								</svg>
							</button>
						{:else}
							<div class="labelled">
								<span class="row-label">
									<span class="row-name warm">Warm-up</span>
									<span class="row-sub num">{warmupsLogged} of {warmups.length}</span>
								</span>
								<div class="rep-row" class:dense={warmups.length > 5}>
									{#each warmups as warmup, w (w)}
										<span class="warm-chip">
											<RepChip
												value={session.warmupReps(index, w)}
												target={warmup.reps}
												label="{movement.name}, warm-up {w + 1} at {formatWeight(warmup.weight)} lb"
												dense={warmups.length > 5}
												warmup
												next={next?.kind === 'warmup' && next.index === w}
												onchange={(reps, source) => recordWarmup(w, reps, source)}
												oncommit={onCommit}
											/>
											<span class="warm-weight num" aria-hidden="true"
												>{formatWeight(warmup.weight)}</span
											>
										</span>
									{/each}
								</div>
							</div>
						{/if}
					{/if}

					<!-- One chip per set, all on one row. With warm-ups, the rows are
					     labelled so the two kinds of set cannot be confused. -->
					<div class:labelled={warmups.length > 0}>
						{#if warmups.length > 0}
							<span class="row-label">
								<span class="row-name">Working</span>
								<span class="row-sub num">{formatWeight(movement.weight)} lb</span>
							</span>
						{/if}
						<div
							class="rep-row"
							class:indented={paired && warmups.length === 0}
							class:dense={exercise.sets > 5}
						>
							{#each setIndexes as setIndex (setIndex)}
								<RepChip
									value={session.reps(index, setIndex, slot)}
									target={exercise.reps}
									label="{movement.name}, set {setIndex + 1}"
									dense={exercise.sets > 5}
									next={next?.kind === 'working' &&
										next.setIndex === setIndex &&
										next.slot === slot}
									onchange={(reps, source) => record(setIndex, slot, reps, source)}
									oncommit={onCommit}
								/>
							{/each}
						</div>
					</div>
				</div>
			{/each}
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
		gap: 16px;
	}
	.note {
		justify-self: start;
	}

	.movement {
		display: grid;
		gap: 10px;
		min-width: 0;
	}
	.mv-head {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	/* The superset's A / B. */
	.letter {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--md-on-primary);
		background: var(--md-primary);
	}
	.mv-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.mv-name {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
		align-self: flex-start;
		max-width: 100%;
		font-size: var(--text-md);
		font-weight: 500;
		line-height: 20px;
		color: var(--md-on-surface);
		text-decoration: none;
	}
	.mv-name svg {
		flex: none;
		color: var(--md-on-surface-variant);
	}
	.mv-name:hover {
		color: var(--md-primary);
	}
	.mv-meta {
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
	}
	/* Small beside the name: its plates carry their own numbers. */
	.art {
		flex: none;
		display: block;
		width: 104px;
	}

	/* Beside the name, with the weight it shows above it when warm-ups are in
	   play — the diagram then follows the next set rather than the working one. */
	.art.with-next {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.next-label {
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--md-primary);
	}
	.next-note {
		font-size: var(--text-xs);
		color: var(--md-on-surface-variant);
	}

	/* A chip row with its label on the left: "Warm-up · 2 of 3", "Working · 225 lb". */
	.labelled {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		min-width: 0;
	}
	.labelled .rep-row {
		flex: 1;
	}
	.row-label {
		flex: none;
		width: 66px;
		display: flex;
		flex-direction: column;
		padding-top: 12px;
	}
	.row-name {
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.row-name.warm {
		color: var(--md-on-tertiary-container);
	}
	.row-sub {
		font-size: var(--text-xs);
		color: var(--md-on-surface-variant);
	}
	/* A warm-up chip with its weight under it. */
	.warm-chip {
		flex: 0 1 52px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.warm-weight {
		font-size: var(--text-xs);
		font-weight: 500;
		text-align: center;
		color: var(--md-on-surface-variant);
	}
	/* The warm-ups, folded once done. Tapping opens them again. */
	.warmups-done {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-height: 40px;
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-pill);
		color: var(--md-on-secondary-container);
		background: var(--md-secondary-container);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}
	.warmups-done span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.warmups-done svg {
		flex: none;
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
