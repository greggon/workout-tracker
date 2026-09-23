<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadingParts, type LoadingConfig } from '$lib/plates';
	import PlateDiagram from '$lib/workout/PlateDiagram.svelte';
	import ReorderButtons from '$lib/ui/ReorderButtons.svelte';
	import UnsavedDialog from '$lib/ui/UnsavedDialog.svelte';
	import { UnsavedGuard } from '$lib/ui/unsaved.svelte';
	import { TOOLS, TOOL_LABELS, type Tool } from '$lib/types';

	type Movement = { movementId: string; name: string; tool: Tool; weight: number };
	type Exercise = {
		id: string;
		sets: number;
		reps: number;
		note: string;
		main: Movement;
		pair: Movement | null;
	};

	type Props = {
		day: { title: string; exercises: Exercise[] };
		catalog: { name: string; defaultTool: Tool }[];
		loading: LoadingConfig;
		form: { message?: string } | null;
	};

	/**
	 * The parent keys this component on the day id. Editing state is seeded from
	 * props once and then owned locally — the form must not reset under the
	 * user's hands when the page data revalidates — so switching days has to
	 * remount rather than reassign.
	 */
	let { day, catalog, loading, form }: Props = $props();

	/** One half of an exercise: the main movement, or its superset partner. */
	type MovementFields = { name: string; tool: Tool; weight: number };

	type Row = {
		id: string | null;
		main: MovementFields;
		/**
		 * Null when the exercise is not a superset. Previously this was a flat
		 * `pairName` string whose "paired but unnamed" state was a single space —
		 * a sentinel that worked only because the server trims. Null says it.
		 */
		pair: MovementFields | null;
		sets: number;
		reps: number;
		note: string;
	};

	function toRow(ex: Exercise): Row {
		return {
			id: ex.id,
			main: { name: ex.main.name, tool: ex.main.tool, weight: ex.main.weight },
			pair: ex.pair ? { name: ex.pair.name, tool: ex.pair.tool, weight: ex.pair.weight } : null,
			sets: ex.sets,
			reps: ex.reps,
			note: ex.note
		};
	}

	// svelte-ignore state_referenced_locally
	let title = $state(day.title);
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(day.exercises.map(toRow));

	/**
	 * Movement ids per saved row, so a History link is a lookup, not a scan.
	 *
	 * Both halves, because both have a history. This held only the main
	 * movement's id, which put one link on the row and pointed it at the first
	 * lift — the paired half, which is a movement in its own right and logged as
	 * one, had no way to reach its own history at all.
	 */
	// svelte-ignore state_referenced_locally
	const movementIds = new Map(
		day.exercises.map((ex) => [
			ex.id,
			{ main: ex.main.movementId, pair: ex.pair?.movementId ?? null }
		])
	);

	/** The movement whose history this half of a row points at, once it is saved. */
	function historyId(row: Row, paired: boolean): string | null {
		const ids = row.id ? movementIds.get(row.id) : null;
		if (!ids) return null;
		return paired ? ids.pair : ids.main;
	}

	/** The form field names the save action reads for each half of a row. */
	function fieldNames(i: number, paired: boolean) {
		return paired
			? { name: `pairName-${i}`, tool: `pairTool-${i}`, weight: `pairWeight-${i}` }
			: { name: `name-${i}`, tool: `tool-${i}`, weight: `weight-${i}` };
	}

	function addRow() {
		rows = [
			...rows,
			{
				id: null,
				main: { name: '', tool: 'barbell', weight: 45 },
				pair: null,
				sets: 2,
				reps: 10,
				note: ''
			}
		];
	}

	function removeRow(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}

	function move(i: number, delta: number) {
		const to = i + delta;
		if (to < 0 || to >= rows.length) return;
		const next = [...rows];
		[next[i], next[to]] = [next[to], next[i]];
		rows = next;
	}

	/**
	 * A new pair starts from the main movement's tool and weight — a superset
	 * partner is usually the same kind of implement, and it is a better first
	 * guess than a barbell at 45.
	 */
	function togglePair(i: number) {
		const row = rows[i];
		row.pair = row.pair ? null : { name: '', tool: row.main.tool, weight: row.main.weight };
	}

	/**
	 * Unsaved edits, compared against what was loaded. The editing state is
	 * plain data, so a serialized snapshot is an exact "has anything changed".
	 */
	// svelte-ignore state_referenced_locally
	const loaded = JSON.stringify({ title, rows });
	const dirty = $derived(JSON.stringify({ title, rows }) !== loaded);

	/*
	 * The save is a native form POST, which leaves the page — so the submit and
	 * an explicit Cancel both let navigation through rather than asking.
	 */
	const guard = new UnsavedGuard(() => dirty, '/routine/[id]');
	let editForm: HTMLFormElement;
</script>

<!--
	Both halves of an exercise render the same four controls; only the labels and
	the form field names differ. They were written out twice, sixty lines apart,
	which is how a fix to one of them misses the other.
-->
{#snippet movementFields(
	movement: MovementFields,
	i: number,
	paired: boolean,
	movementId: string | null
)}
	{@const names = fieldNames(i, paired)}
	{@const load = loadingParts(movement.tool, movement.weight, loading)}
	<div class="movement" class:paired>
		<label class="field name">
			<span>{paired ? 'Superset with' : 'Movement'}</span>
			<input
				class="input"
				name={names.name}
				list="movement-names"
				bind:value={movement.name}
				placeholder={paired ? 'Second movement' : 'Movement name'}
			/>
		</label>
		<label class="field">
			<span>Tool</span>
			<select class="input" name={names.tool} bind:value={movement.tool}>
				{#each TOOLS as tool (tool)}
					<option value={tool}>{TOOL_LABELS[tool]}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Weight</span>
			<input
				class="input num"
				type="number"
				step="0.5"
				min="0"
				inputmode="decimal"
				name={names.weight}
				bind:value={movement.weight}
			/>
		</label>

		<!-- The same block as the workout screen: the weight, what it cannot say
		     about itself, then the drawing under both. -->
		<div class="load">
			<div class="load-head">
				<div class="load-text">
					<div class="load-total num">{load.total}</div>
					{#if load.note}
						<div class="load-note num">{load.note}</div>
					{/if}
				</div>
				{#if movementId}
					<!-- Beside the movement it belongs to, so both halves of a superset
					     have one. It is hidden on an unsaved row because there is no
					     movement to have a history yet. -->
					<a
						class="btn btn-ghost history"
						href="{resolve('/history/[id]', {
							id: movementId
						})}?back={encodeURIComponent(resolve('/routine'))}"
					>
						History
					</a>
				{/if}
			</div>
			<span class="art">
				<PlateDiagram tool={movement.tool} weight={movement.weight} config={loading} />
			</span>
		</div>
	</div>
{/snippet}

<datalist id="movement-names">
	{#each catalog as m (m.name)}
		<option value={m.name}></option>
	{/each}
</datalist>

<form method="POST" action="?/save" bind:this={editForm} onsubmit={() => guard.pass()}>
	{#if form?.message}
		<p class="notice notice-error" role="alert">{form.message}</p>
	{/if}

	<!-- The day's letter is the page title now; this is only its name. -->
	<label class="field">
		<span>Day name</span>
		<input class="input title" name="title" bind:value={title} />
	</label>

	<p class="text-muted hint">
		Pair a movement to make it a superset — both halves are logged and both count toward volume.
		Clear a movement's name to remove it when you save.
	</p>

	<h2 class="section-label">Exercises</h2>

	<input type="hidden" name="count" value={rows.length} />

	<ul class="rows">
		{#each rows as row, i (row.id ?? `new-${i}`)}
			<li class="row">
				<input type="hidden" name="id-{i}" value={row.id ?? ''} />

				<div class="row-head">
					<span class="badge badge-quiet num">{i + 1}</span>
					<ReorderButtons
						name="exercise {i + 1}"
						first={i === 0}
						last={i === rows.length - 1}
						onmove={(delta) => move(i, delta)}
					/>
					<button
						type="button"
						class="btn btn-icon btn-danger-quiet remove"
						onclick={() => removeRow(i)}
						aria-label="Remove exercise {i + 1}"
						title="Remove"
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.9"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
							/>
						</svg>
					</button>
				</div>

				{@render movementFields(row.main, i, false, historyId(row, false))}

				{#if row.pair}
					{@render movementFields(row.pair, i, true, historyId(row, true))}
				{/if}

				<div class="prescription">
					<label class="field">
						<span>Sets</span>
						<input
							class="input num"
							type="number"
							min="1"
							inputmode="numeric"
							name="sets-{i}"
							bind:value={row.sets}
						/>
					</label>
					<label class="field">
						<span>Reps</span>
						<input
							class="input num"
							type="number"
							min="1"
							inputmode="numeric"
							name="reps-{i}"
							bind:value={row.reps}
						/>
					</label>
					<label class="field note">
						<span>Note</span>
						<input
							class="input"
							name="note-{i}"
							bind:value={row.note}
							placeholder="Myorep break, drop set…"
						/>
					</label>
					<button type="button" class="btn btn-secondary pair-toggle" onclick={() => togglePair(i)}>
						{row.pair ? 'Remove superset' : 'Make a superset'}
					</button>
				</div>
			</li>
		{/each}
	</ul>

	<button type="button" class="btn btn-secondary btn-block" onclick={addRow}>Add exercise</button>

	<!-- Pinned to the bottom of the screen while the form is on it: the save
	     used to sit below the last exercise, a screen or two of scrolling
	     away from whatever you had just changed. -->
	<div class="actions">
		<a class="btn btn-secondary" href={resolve('/routine')} onclick={() => guard.pass()}>Cancel</a>
		<button class="btn btn-primary save" type="submit">Save day</button>
	</div>
</form>

{#if guard.leavingTo}
	<UnsavedDialog
		title="Day not saved"
		text="You have changed this day and not saved it. Leaving now throws the changes away."
		onstay={() => guard.stay()}
		ondiscard={() => guard.go()}
		onsave={() => editForm.requestSubmit()}
		saveLabel="Save day"
	/>
{/if}

<style>
	.title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: var(--text-lg);
	}
	.hint {
		font-size: var(--text-sm);
		margin: 10px 0 0;
	}

	.rows {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: grid;
		gap: 12px;
	}
	.row {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: 12px 16px 16px;
		display: grid;
		gap: 12px;
	}

	.row-head {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.row-head .badge {
		margin-right: auto;
	}

	/* The workout screen's arrangement: the load on the left, its History link
	   against the right edge of the same line. */
	.load-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		min-width: 0;
	}
	.history {
		flex: none;
		margin-left: auto;
		font-size: var(--text-md);
		text-decoration: none;
	}

	/*
	 * Fixed columns, not wrapping flex. Flex-basis 150/130/84 let the content
	 * decide the rows: Weight alone on a line at 390px, and at 360px the
	 * indented pair dropped its Tool while the main movement kept it, so the two
	 * halves of a superset stopped lining up. The name gets a line to itself;
	 * everything else pairs up.
	 */
	.movement,
	.prescription {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		align-items: end;
	}
	.name,
	.note,
	.load,
	.pair-toggle {
		grid-column: 1 / -1;
	}
	/* Its own tinted block rather than a left rule: it is the second half of
	   the exercise, and the tint keeps it inside the card's columns. */
	.paired {
		padding: 12px;
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-bg) 55%, var(--color-surface));
	}
	.paired .name > span {
		color: var(--color-accent);
	}

	.load {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	/* The workout screen's size, so the same lift looks the same in both. */
	.art {
		display: block;
		width: 100%;
		max-width: 150px;
	}
	.load-text {
		min-width: 0;
	}
	.load-total {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: var(--text-md);
		color: var(--color-text);
	}
	.load-note {
		font-size: var(--text-sm);
		color: var(--color-neutral-500);
		margin-top: 1px;
	}

	.field {
		min-width: 0;
	}
	.pair-toggle {
		font-size: var(--text-md);
	}

	.actions {
		position: sticky;
		bottom: 0;
		z-index: 20;
		display: flex;
		gap: 10px;
		margin: 22px calc(-1 * var(--gutter)) 0;
		padding: 12px var(--gutter) calc(12px + env(safe-area-inset-bottom));
		background: color-mix(in srgb, var(--color-bg) 88%, transparent);
		backdrop-filter: blur(12px);
		box-shadow: 0 -1px 0 var(--color-divider);
	}
	.actions .btn {
		flex: 1;
		min-height: 48px;
		text-decoration: none;
	}
	.actions .save {
		flex: 2;
	}

	/* A window is wide enough for a movement's three fields on one line. */
	@media (min-width: 900px) and (pointer: fine) {
		.movement {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
		}
		.prescription {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) auto;
		}
		.name,
		.note,
		.pair-toggle {
			grid-column: auto;
		}
		.actions {
			position: static;
			margin-inline: 0;
			padding: 0;
			background: none;
			backdrop-filter: none;
			box-shadow: none;
		}
		.actions .btn {
			flex: none;
			min-width: 140px;
		}
	}
</style>
