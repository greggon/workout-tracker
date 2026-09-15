<script lang="ts">
	import { resolve } from '$app/paths';
	import { loadingLabel, type LoadingConfig } from '$lib/plates';
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

	type Row = {
		id: string | null;
		name: string;
		tool: Tool;
		weight: number;
		pairName: string;
		pairTool: Tool;
		pairWeight: number;
		sets: number;
		reps: number;
		note: string;
	};

	function toRow(ex: Exercise): Row {
		return {
			id: ex.id,
			name: ex.main.name,
			tool: ex.main.tool,
			weight: ex.main.weight,
			pairName: ex.pair?.name ?? '',
			pairTool: ex.pair?.tool ?? ex.main.tool,
			pairWeight: ex.pair?.weight ?? ex.main.weight,
			sets: ex.sets,
			reps: ex.reps,
			note: ex.note
		};
	}

	// svelte-ignore state_referenced_locally
	let title = $state(day.title);
	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(day.exercises.map(toRow));

	function addRow() {
		rows = [
			...rows,
			{
				id: null,
				name: '',
				tool: 'barbell',
				weight: 45,
				pairName: '',
				pairTool: 'barbell',
				pairWeight: 45,
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

	function togglePair(i: number) {
		const next = [...rows];
		next[i] = { ...next[i], pairName: next[i].pairName ? '' : ' ' };
		rows = next;
	}
</script>

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
					{#if row.id}
						<a
							class="btn btn-ghost history"
							href="{resolve('/movements/[id]', {
								id: day.exercises.find((e) => e.id === row.id)?.main.movementId ?? ''
							})}?back={encodeURIComponent(resolve('/routine'))}"
						>
							History
						</a>
					{/if}
					<button type="button" class="btn btn-ghost remove" onclick={() => removeRow(i)}>
						Remove
					</button>
				</div>

				<div class="movement">
					<label class="field">
						<span>Movement</span>
						<input
							class="input"
							name="name-{i}"
							list="movement-names"
							bind:value={row.name}
							placeholder="Movement name"
						/>
					</label>
					<label class="field tool">
						<span>Tool</span>
						<select class="input" name="tool-{i}" bind:value={row.tool}>
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
							name="weight-{i}"
							bind:value={row.weight}
						/>
					</label>

					<div class="load">
						<PlateDiagram tool={row.tool} weight={row.weight} config={loading} />
						<span class="load-text num">{loadingLabel(row.tool, row.weight, loading)}</span>
					</div>
				</div>

				{#if row.pairName}
					<div class="movement paired">
						<label class="field">
							<span>Paired with</span>
							<input
								class="input"
								name="pairName-{i}"
								list="movement-names"
								bind:value={row.pairName}
								placeholder="Second movement"
							/>
						</label>
						<label class="field tool">
							<span>Tool</span>
							<select class="input" name="pairTool-{i}" bind:value={row.pairTool}>
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
								name="pairWeight-{i}"
								bind:value={row.pairWeight}
							/>
						</label>

						<div class="load">
							<PlateDiagram tool={row.pairTool} weight={row.pairWeight} config={loading} />
							<span class="load-text num"
								>{loadingLabel(row.pairTool, row.pairWeight, loading)}</span
							>
						</div>
					</div>
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
						{row.pairName ? 'Unpair' : 'Pair'}
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
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.load-text {
		font-size: 11.5px;
		color: var(--color-neutral-500);
		min-width: 0;
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
