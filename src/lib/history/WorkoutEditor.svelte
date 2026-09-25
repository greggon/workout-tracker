<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { WorkoutDetail } from '$lib/server/workouts';
	import type { Tool } from '$lib/types';
	import UnsavedDialog from '$lib/ui/UnsavedDialog.svelte';
	import { UnsavedGuard } from '$lib/ui/unsaved.svelte';
	import { formatVolume, setVolume } from '$lib/volume';
	import RepChip from '$lib/workout/RepChip.svelte';

	/**
	 * A past workout, correctable: each set's reps with the same chips as the
	 * workout screen (tap to log the target, tap again for one fewer, hold to
	 * type), and each movement's weight.
	 *
	 * The parent keys this on the loaded workout, so a save that reloads it
	 * starts the editor over from what was stored.
	 */
	type Props = {
		workout: WorkoutDetail;
		form: { message?: string; saved?: boolean } | null;
	};
	let { workout, form }: Props = $props();

	type SlotState = {
		slot: number;
		name: string;
		tool: Tool;
		weight: number;
		reps: (number | null)[];
	};

	// svelte-ignore state_referenced_locally
	let exercises = $state(
		workout.exercises.map((ex) => ({
			exerciseIndex: ex.exerciseIndex,
			target: ex.target ?? 10,
			sets: ex.sets,
			warmups: ex.warmups.map((w) => ({ ...w })),
			slots: ex.slots.map((s): SlotState => ({
				slot: s.slot,
				name: s.name,
				tool: s.tool,
				weight: s.weight,
				reps: [...s.reps]
			}))
		}))
	);

	const edits = $derived({
		exercises: exercises.map((ex) => ({
			exerciseIndex: ex.exerciseIndex,
			slots: ex.slots.map((s) => ({ slot: s.slot, weight: s.weight, reps: s.reps })),
			warmups: ex.warmups.map((w) => w.reps)
		}))
	});
	// svelte-ignore state_referenced_locally
	const loaded = JSON.stringify(edits);
	const dirty = $derived(JSON.stringify(edits) !== loaded);

	const weightsValid = $derived(
		exercises.every((ex) => ex.slots.every((s) => Number.isFinite(s.weight) && s.weight >= 0))
	);
	const anySet = $derived(
		exercises.some(
			(ex) =>
				ex.slots.some((s) => s.reps.some((r) => r != null)) ||
				ex.warmups.some((w) => w.reps != null)
		)
	);

	/** The workout's volume as edited, so a correction shows its effect. */
	const volume = $derived(
		exercises.reduce(
			(sum, ex) =>
				sum +
				// Warm-ups count: the main movement, at each warm-up's weight.
				ex.warmups.reduce(
					(n, w) =>
						w.reps == null || !ex.slots[0]
							? n
							: n + setVolume({ tool: ex.slots[0].tool, weight: w.weight }, w.reps),
					0
				) +
				ex.slots.reduce(
					(n, s) =>
						n +
						s.reps.reduce<number>(
							(m, r) => (r == null ? m : m + setVolume({ tool: s.tool, weight: s.weight || 0 }, r)),
							0
						),
					0
				),
			0
		)
	);

	const guard = new UnsavedGuard(() => dirty, '/history/workouts/[id]');
	let editForm: HTMLFormElement;
	let saving = $state(false);

	const letter = (slot: number) => String.fromCharCode(65 + slot);

	// svelte-ignore state_referenced_locally
	const date = new Date(workout.startedAt).toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
</script>

<p class="text-muted intro num">
	{date}{workout.dayTitle ? ` · ${workout.dayTitle}` : ''} · {workout.durationMins} min · {formatVolume(
		volume
	)} lb
</p>

{#if form?.message}
	<p class="notice notice-error" role="alert">{form.message}</p>
{:else if form?.saved && !dirty}
	<p class="notice" role="status">Saved.</p>
{/if}

<form
	method="POST"
	action="?/save"
	bind:this={editForm}
	use:enhance={() => {
		// A save stays on this page, so the unsaved-changes guard has nothing to
		// let through; the reload that follows starts the editor over.
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
>
	<input type="hidden" name="edits" value={JSON.stringify(edits)} />

	<div class="exercises">
		{#each exercises as ex (ex.exerciseIndex)}
			{@const paired = ex.slots.length > 1}
			<section class="exercise">
				<h2 class="ex-title">
					{ex.slots.map((s) => s.name).join('  →  ')}
					<span class="ex-meta num">{ex.sets} × {ex.target}</span>
				</h2>
				{#if ex.warmups.length}
					<div class="warmups">
						<span class="row-label">Warm-up</span>
						<div class="rep-row" class:dense={ex.warmups.length > 5}>
							{#each ex.warmups as w, i (i)}
								<span class="warm-chip">
									<RepChip
										value={w.reps}
										target={w.target}
										label="{ex.slots[0]?.name ?? 'Warm-up'}, warm-up {i + 1} at {w.weight} lb"
										dense={ex.warmups.length > 5}
										warmup
										onchange={(value) => (w.reps = value)}
									/>
									<span class="warm-weight num" aria-hidden="true">{w.weight}</span>
								</span>
							{/each}
						</div>
					</div>
				{/if}
				{#each ex.slots as s (s.slot)}
					<div class="movement">
						<div class="mv-head">
							{#if paired}
								<span class="letter" aria-hidden="true">{letter(s.slot)}</span>
							{/if}
							<span class="mv-name">{s.name}</span>
							<label class="weight">
								<span class="visually-hidden">Weight for {s.name}, in pounds</span>
								<input
									class="input num"
									type="number"
									inputmode="decimal"
									step="0.5"
									min="0"
									bind:value={s.weight}
								/>
								<span class="unit" aria-hidden="true">lb</span>
							</label>
						</div>
						<div class="rep-row" class:indented={paired} class:dense={ex.sets > 5}>
							{#each s.reps as reps, setIndex (setIndex)}
								<RepChip
									value={reps}
									target={ex.target}
									label="{s.name}, set {setIndex + 1}"
									dense={ex.sets > 5}
									onchange={(value) => (s.reps[setIndex] = value)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/each}
	</div>

	{#if !anySet}
		<p class="notice notice-error">A workout needs at least one set logged.</p>
	{/if}

	{#if dirty}
		<!-- Only while there is something to save; Save and Cancel pinned to the
		     bottom like the day editor's. -->
		<div class="actions">
			<a
				class="btn btn-secondary"
				href="{resolve('/history')}?tab=workouts"
				onclick={() => guard.pass()}>Cancel</a
			>
			<button
				class="btn btn-primary save"
				type="submit"
				disabled={saving || !weightsValid || !anySet}
			>
				{saving ? 'Saving…' : 'Save changes'}
			</button>
		</div>
	{/if}
</form>

{#if guard.leavingTo}
	<UnsavedDialog
		title="Changes not saved"
		text="You have corrected this workout and not saved it. Leaving now throws the changes away."
		onstay={() => guard.stay()}
		ondiscard={() => guard.go()}
		onsave={() => editForm.requestSubmit()}
		saveLabel="Save changes"
		saveDisabled={!weightsValid || !anySet}
	/>
{/if}

<style>
	.intro {
		margin: 0 0 16px;
		font-size: var(--text-md);
	}

	.exercises {
		display: grid;
		gap: 12px;
	}
	.exercise {
		display: grid;
		gap: 14px;
		padding: 14px 16px 16px;
		border-radius: var(--radius-lg);
		background: var(--md-surface-container);
	}
	.ex-title {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: var(--text-lg);
		font-weight: 500;
		line-height: 24px;
	}
	.ex-meta {
		margin-left: auto;
		flex: none;
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--md-on-surface-variant);
	}

	/* The warm-ups, before the working sets: each chip with its weight under
	   it. Only their reps are edited here. */
	.warmups {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.warmups .rep-row {
		flex: 1;
	}
	.row-label {
		flex: none;
		width: 66px;
		padding-top: 14px;
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--md-on-tertiary-container);
	}
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
	/* The superset's A / B, as on the workout screen. */
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
	.mv-name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-md);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.weight {
		position: relative;
		flex: none;
		width: 104px;
	}
	.weight .input {
		min-height: 44px;
		padding-right: 32px;
		text-align: right;
		background: var(--md-surface);
	}
	.unit {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		font-size: var(--text-sm);
		color: var(--md-on-surface-variant);
		pointer-events: none;
	}

	.actions {
		position: sticky;
		bottom: 0;
		z-index: 20;
		display: flex;
		gap: 10px;
		margin: 22px calc(-1 * var(--gutter)) 0;
		padding: 12px var(--gutter) calc(12px + env(safe-area-inset-bottom));
		background: var(--md-surface-container);
	}
	.actions .btn {
		flex: 1;
		min-height: 48px;
		text-decoration: none;
	}
	.actions .save {
		flex: 2;
	}
	@media (min-width: 900px) and (pointer: fine) {
		.actions {
			position: static;
			margin-inline: 0;
			padding: 0;
			background: none;
		}
		.actions .btn {
			flex: none;
			min-width: 140px;
		}
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
