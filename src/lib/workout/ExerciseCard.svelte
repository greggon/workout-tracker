<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { loadingLabel, type LoadingConfig } from '$lib/plates';
	import { TOOL_SPEC } from '$lib/types';
	import { formatWeight, relativeDay } from '$lib/volume';
	import PlateDiagram from './PlateDiagram.svelte';
	import { movementsOf, type SessionExercise, type WorkoutSession } from './session.svelte';

	/** `loggedAt` survives the load boundary as a Date, not an epoch number. */
	type LastLog = { weight: number; reps: number; loggedAt: Date };

	type Props = {
		session: WorkoutSession;
		exercise: SessionExercise;
		index: number;
		config: LoadingConfig;
		lastLogs: Record<string, LastLog>;
		onOpen: () => void;
		/** Fired after any set changes, so the page can auto-advance. */
		onLogged: () => void;
	};

	let { session, exercise, index, config, lastLogs, onOpen, onLogged }: Props = $props();

	const movements = $derived(movementsOf(exercise));
	const done = $derived(session.isExerciseDone(index));
	const open = $derived(session.active === index && !done);
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

	function record(setIndex: number, slot: number, reps: number | null) {
		session.logSet(index, setIndex, slot, reps);
		onLogged();
	}

	function onReps(setIndex: number, slot: number, value: string) {
		const trimmed = value.trim();
		record(setIndex, slot, trimmed === '' ? null : Number(trimmed));
	}
</script>

<li class="card-wrap" class:open class:done data-exercise={index}>
	<button class="head" type="button" onclick={onOpen} aria-expanded={open}>
		<span class="dot" class:dot-open={open} class:dot-done={done}>
			{done ? '✓' : index + 1}
		</span>
		<span class="head-text">
			<span class="name" class:struck={done}>{title}</span>
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
					<div class="load">
						<span class="art">
							<PlateDiagram tool={movement.tool} weight={movement.weight} {config} />
						</span>
						<div class="load-text">
							<div class="load-name">{movement.name}</div>
							<div class="load-setup num">
								{loadingLabel(movement.tool, movement.weight, config)}
							</div>
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
								<span class="entry-name">{movement.name}</span>
								<span class="entry-weight num">{formatWeight(movement.weight)} lb</span>
								<input
									class="input num entry-reps"
									type="number"
									inputmode="numeric"
									min="0"
									placeholder={String(exercise.reps)}
									value={value ?? ''}
									oninput={(e) => onReps(setIndex, slot, e.currentTarget.value)}
									aria-label="Reps completed, {movement.name}, set {setIndex + 1}"
								/>
								<button
									type="button"
									class="btn check"
									class:checked={value === exercise.reps}
									onclick={() => record(setIndex, slot, exercise.reps)}
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
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		min-width: 0;
	}
	/* The diagram is fluid, so it needs a slot to sit in. At phone width it
	   takes the whole row rather than squeezing the movement name to nothing. */
	.art {
		flex: 0 0 160px;
		max-width: 100%;
	}
	@media (max-width: 420px) {
		.art {
			flex-basis: 100%;
		}
	}
	.load-text {
		min-width: 0;
	}
	.load-name {
		font-size: 12.5px;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
	}
	.load-setup {
		font-size: 11px;
		color: var(--color-neutral-500);
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

	.entry {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.entry-name {
		flex: 1;
		min-width: 0;
		font-size: 13.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.entry-weight {
		flex: none;
		font-size: 12px;
		color: var(--color-neutral-500);
	}
	.entry-reps {
		flex: none;
		width: 64px;
		text-align: center;
	}

	.check {
		flex: none;
		width: 38px;
		border-color: var(--color-divider);
		color: var(--color-neutral-500);
	}
	.check.checked {
		color: var(--color-accent);
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
</style>
