<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadingParts, type LoadingConfig } from '$lib/plates';
	import PlateDiagram from '$lib/workout/PlateDiagram.svelte';
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
		day: { key: string; title: string; exercises: Exercise[] };
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

	/** Movement id per saved row, so the History link is a lookup, not a scan. */
	// svelte-ignore state_referenced_locally
	const movementIds = new Map(day.exercises.map((ex) => [ex.id, ex.main.movementId]));

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
</script>

<!--
	Both halves of an exercise render the same four controls; only the labels and
	the form field names differ. They were written out twice, sixty lines apart,
	which is how a fix to one of them misses the other.
-->
{#snippet movementFields(movement: MovementFields, i: number, paired: boolean)}
	{@const names = fieldNames(i, paired)}
	{@const load = loadingParts(movement.tool, movement.weight, loading)}
	<div class="movement" class:paired>
		<label class="field">
			<span>{paired ? 'Paired with' : 'Movement'}</span>
			<input
				class="input"
				name={names.name}
				list="movement-names"
				bind:value={movement.name}
				placeholder={paired ? 'Second movement' : 'Movement name'}
			/>
		</label>
		<label class="field tool">
			<span>Tool</span>
			<select class="input" name={names.tool} bind:value={movement.tool}>
				{#each TOOLS as tool (tool)}
					<option value={tool}>{TOOL_LABELS[tool]}</option>
				{/each}
			</select>
		</label>
		<label class="field short">
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
			<div class="load-text">
				<div class="load-total num">{load.total}</div>
				{#if load.note}
					<div class="load-note num">{load.note}</div>
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

<form method="POST" action="?/save">
	<div class="head">
		<span class="badge">{day.key}</span>
		<input class="input title" name="title" bind:value={title} aria-label="Day title" />
	</div>

	{#if form?.message}
		<p class="error" role="alert">{form.message}</p>
	{/if}

	<p class="text-muted hint">
		Give a movement a pair to make it a superset — both halves are logged and both count toward
		volume. Clearing a movement's name removes it when you save.
	</p>

	<input type="hidden" name="count" value={rows.length} />

	<ul class="rows">
		{#each rows as row, i (row.id ?? `new-${i}`)}
			<li class="row">
				<input type="hidden" name="id-{i}" value={row.id ?? ''} />

				<div class="row-head">
					<div class="arrows">
						<button
							type="button"
							class="btn btn-secondary btn-icon arrow"
							onclick={() => move(i, -1)}
							disabled={i === 0}
							aria-label="Move up">↑</button
						>
						<button
							type="button"
							class="btn btn-secondary btn-icon arrow"
							onclick={() => move(i, 1)}
							disabled={i === rows.length - 1}
							aria-label="Move down">↓</button
						>
					</div>
					<span class="index num">{i + 1}</span>
					{#if row.id && movementIds.has(row.id)}
						<a
							class="btn btn-ghost history"
							href="{resolve('/movements/[id]', {
								id: movementIds.get(row.id)!
							})}?back={encodeURIComponent(resolve('/routine'))}"
						>
							History
						</a>
					{/if}
					<button type="button" class="btn btn-ghost remove" onclick={() => removeRow(i)}>
						Remove
					</button>
				</div>

				{@render movementFields(row.main, i, false)}

				{#if row.pair}
					{@render movementFields(row.pair, i, true)}
				{/if}

				<div class="prescription">
					<label class="field short">
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
					<label class="field short">
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
					<label class="field">
						<span>Note</span>
						<input
							class="input"
							name="note-{i}"
							bind:value={row.note}
							placeholder="Myorep break, drop set…"
						/>
					</label>
					<button type="button" class="btn btn-secondary pair-toggle" onclick={() => togglePair(i)}>
						{row.pair ? 'Unpair' : 'Pair'}
					</button>
				</div>
			</li>
		{/each}
	</ul>

	<button type="button" class="btn btn-secondary btn-block" onclick={addRow}>Add exercise</button>

	<div class="actions">
		<button class="btn btn-primary" type="submit">Save day</button>
		<a class="btn btn-secondary" href={resolve('/routine')}>Cancel</a>
	</div>
</form>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-top: 22px;
		margin-bottom: 12px;
	}
	.badge {
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		font-family: var(--font-heading);
		font-size: 16px;
		color: var(--color-accent-200);
		background: var(--color-accent-800);
	}
	.title {
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 20px;
	}
	.hint {
		font-size: 12.5px;
		margin: 0 0 18px;
	}
	.error {
		color: var(--color-accent-300);
		background: var(--color-accent-900);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		font-size: 13.5px;
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
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 12px 14px;
		display: grid;
		gap: 10px;
	}

	.row-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.arrows {
		display: flex;
		gap: 4px;
	}
	.arrow {
		width: 30px;
		height: 26px;
		min-height: 0;
		font-size: 13px;
	}
	.index {
		font-size: 12px;
		color: var(--color-neutral-500);
		margin-right: auto;
	}
	.remove {
		font-size: 12px;
		color: var(--color-neutral-400);
	}
	.history {
		font-size: 12px;
		text-decoration: none;
	}

	.movement,
	.prescription {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: flex-end;
	}
	.paired {
		padding-left: 14px;
		border-left: 2px solid var(--color-accent-700);
	}

	.load {
		flex: 1 1 100%;
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
		font-size: 13.5px;
		color: var(--color-text);
	}
	.load-note {
		font-size: 11.5px;
		color: var(--color-neutral-500);
		margin-top: 1px;
	}

	.field {
		flex: 1 1 150px;
		min-width: 0;
	}
	.field > span {
		display: block;
		font-size: 11px;
		margin-bottom: 4px;
		color: var(--color-neutral-500);
	}
	.short {
		flex: 0 0 84px;
	}
	.tool {
		flex: 0 0 130px;
	}
	.pair-toggle {
		flex: none;
		font-size: 12.5px;
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-top: 22px;
	}
	.actions .btn {
		text-decoration: none;
	}
</style>
