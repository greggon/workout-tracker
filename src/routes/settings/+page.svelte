<script lang="ts">
	import { describeStock, loadingLabel, normalizeStock, perSideStock } from '$lib/plates';
	import PlateDiagram from '$lib/workout/PlateDiagram.svelte';
	import {
		DEFAULT_PLATE_COLOR,
		TOOLS,
		TOOL_LABELS,
		TOOL_SPEC,
		type PlateStock,
		type Tool
	} from '$lib/types';

	let { data, form } = $props();

	let barWeight = $derived(data.settings.barWeight);
	let ezBarWeight = $derived(data.settings.ezBarWeight);
	let rows = $derived<PlateStock[]>(normalizeStock(data.settings.plateInventory));

	let sampleWeight = $state(135);
	let sampleTool = $state<Tool>('barbell');

	const config = $derived({
		barWeight: Number(barWeight) || 0,
		ezBarWeight: Number(ezBarWeight) || 0,
		inventory: rows
	});
	const usable = $derived(normalizeStock(rows).length > 0);

	/** What one sleeve may actually draw on, which is the number that bites. */
	const perSide = $derived(perSideStock(rows, TOOL_SPEC.barbell.sleeves));

	function addRow() {
		rows = [...rows, { weight: 0, count: 2, color: DEFAULT_PLATE_COLOR }];
	}
	function removeRow(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}

	/**
	 * Replaces a row rather than mutating one.
	 *
	 * `rows` is a writable `$derived` over plain objects, so assigning to
	 * `row.color` changes the object without producing a signal: the preview and
	 * the per-sleeve column would both keep showing the values from before the
	 * edit. Assigning to `rows` is what makes the change visible.
	 */
	function update(i: number, patch: Partial<PlateStock>) {
		rows = rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
	}

	/** A cleared number field is empty, not zero — do not render NaN into it. */
	const shown = (value: number) => (Number.isFinite(value) ? value : '');
</script>

<svelte:head>
	<title>Equipment</title>
</svelte:head>

<p class="text-muted sub">
	The plate diagrams are built from this, so they only ask for plates you actually have.
</p>

{#if form?.message}
	<p class="notice error" role="alert">{form.message}</p>
{:else if form?.saved}
	<p class="notice ok" role="status">Saved.</p>
{/if}

<form method="POST" action="?/save">
	<div class="row">
		<label class="field short">
			<span>Bar</span>
			<input
				class="input num"
				type="number"
				step="0.5"
				min="0"
				inputmode="decimal"
				name="barWeight"
				bind:value={barWeight}
			/>
		</label>
		<label class="field short">
			<span>EZ curl bar</span>
			<input
				class="input num"
				type="number"
				step="0.5"
				min="0"
				inputmode="decimal"
				name="ezBarWeight"
				bind:value={ezBarWeight}
			/>
		</label>
	</div>

	<h6 class="label">Plates you own</h6>
	<p class="text-muted hint">
		Count the whole pile, not per side. A barbell splits it in two; a landmine or a machine loads
		one end, so the whole pile is available to it. Colours are how the plates look in your gym — the
		loading diagrams use them, so a stack is recognisable before you read the numbers.
	</p>

	<input type="hidden" name="rows" value={rows.length} />
	<ul class="plates">
		<li class="plates-head">
			<span>Weight</span>
			<span>Own</span>
			<span>Colour</span>
			<span class="per">Per sleeve</span>
			<span></span>
		</li>
		{#each rows as row, i (i)}
			<li class="plate-row">
				<input
					class="input num"
					type="number"
					step="0.25"
					min="0"
					inputmode="decimal"
					name="weight-{i}"
					value={shown(row.weight)}
					oninput={(e) => update(i, { weight: e.currentTarget.valueAsNumber })}
					aria-label="Plate weight"
				/>
				<input
					class="input num"
					type="number"
					step="1"
					min="0"
					inputmode="numeric"
					name="count-{i}"
					value={shown(row.count)}
					oninput={(e) => update(i, { count: e.currentTarget.valueAsNumber })}
					aria-label="How many you own"
				/>
				<span class="swatch-wrap">
					<input
						class="swatch"
						type="color"
						name="color-{i}"
						value={row.color}
						oninput={(e) => update(i, { color: e.currentTarget.value })}
						aria-label="Colour of the {row.weight} lb plates"
					/>
				</span>
				<span class="per num">{Math.floor((Number(row.count) || 0) / 2) || '—'}</span>
				<button type="button" class="btn btn-ghost drop" onclick={() => removeRow(i)}>Remove</button
				>
			</li>
		{/each}
	</ul>

	<button type="button" class="btn btn-secondary btn-block" onclick={addRow}>Add a plate</button>

	<p class="text-muted hint">Reads as: {describeStock(rows)}</p>
	{#if perSide.length === 0 && usable}
		<p class="notice error">
			You own fewer than two of every plate, so none can go on a bar evenly.
		</p>
	{/if}

	<button class="btn btn-primary save" type="submit" disabled={!usable}>Save equipment</button>
</form>

<h6 class="label">Try a weight</h6>
<div class="row">
	<label class="field short">
		<span>Weight</span>
		<input
			class="input num"
			type="number"
			step="0.5"
			min="0"
			inputmode="decimal"
			bind:value={sampleWeight}
		/>
	</label>
	<label class="field tool">
		<span>Tool</span>
		<select class="input" bind:value={sampleTool}>
			{#each TOOLS as tool (tool)}
				<option value={tool}>{TOOL_LABELS[tool]}</option>
			{/each}
		</select>
	</label>
</div>

{#if usable}
	<div class="preview">
		<span class="art">
			<PlateDiagram tool={sampleTool} weight={Number(sampleWeight) || 0} {config} />
		</span>
		<span class="num preview-text"
			>{loadingLabel(sampleTool, Number(sampleWeight) || 0, config)}</span
		>
	</div>
{/if}

<style>
	.sub {
		max-width: 46ch;
		margin: 0 0 20px;
		font-size: 15px;
	}
	.label {
		color: var(--color-neutral-500);
		margin: 30px 0 8px;
	}

	.notice {
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		font-size: 13.5px;
	}
	.error {
		color: var(--color-accent-300);
		background: var(--color-accent-900);
	}
	.ok {
		color: var(--color-neutral-300);
		background: var(--color-neutral-900);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: flex-end;
		margin-bottom: 12px;
	}
	.field {
		flex: 1 1 200px;
		min-width: 0;
	}
	.field > span {
		display: block;
		font-size: 11px;
		margin-bottom: 4px;
		color: var(--color-neutral-500);
	}
	.short {
		flex: 0 0 130px;
	}
	.tool {
		flex: 0 0 150px;
	}
	.hint {
		font-size: 12px;
		margin: 0 0 12px;
	}

	.plates {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.plates-head,
	.plate-row {
		display: grid;
		/* weight · own · colour · per sleeve · remove */
		grid-template-columns: 1fr 1fr 44px 78px auto;
		gap: 8px;
		align-items: center;
	}
	.plates-head {
		font-size: 10.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
	}
	.per {
		text-align: right;
		font-size: 12.5px;
		color: var(--color-neutral-500);
	}
	.drop {
		font-size: 12px;
		color: var(--color-neutral-400);
	}
	.save {
		margin-top: 8px;
	}

	.preview {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 14px;
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
		padding: 14px;
	}
	/* Roomier here than in a list: this is the drawing you study while you are
	   deciding what colour a plate is. */
	.art {
		flex: 0 0 190px;
		max-width: 100%;
	}
	@media (max-width: 420px) {
		.art {
			flex-basis: 100%;
		}
	}
	.preview-text {
		font-size: 12.5px;
		color: var(--color-neutral-500);
		min-width: 0;
	}
</style>
