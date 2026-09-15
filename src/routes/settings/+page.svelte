<script lang="ts">
	import { resolve } from '$app/paths';
	import { describeStock, loadingLabel, normalizeStock, perSideStock } from '$lib/plates';
	import PlateDiagram from '$lib/workout/PlateDiagram.svelte';
	import { TOOLS, TOOL_LABELS, TOOL_SPEC, type PlateStock, type Tool } from '$lib/types';

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
		rows = [...rows, { weight: 0, count: 2 }];
	}
	function removeRow(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}
</script>

<svelte:head>
	<title>Equipment</title>
</svelte:head>

<div class="head">
	<h2>Equipment</h2>
	<a class="btn btn-ghost" href={resolve('/routine')}>Back</a>
</div>
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
		one end, so the whole pile is available to it.
	</p>

	<input type="hidden" name="rows" value={rows.length} />
	<ul class="plates">
		<li class="plates-head">
			<span>Weight</span>
			<span>Own</span>
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
					bind:value={row.weight}
					aria-label="Plate weight"
				/>
				<input
					class="input num"
					type="number"
					step="1"
					min="0"
					inputmode="numeric"
					name="count-{i}"
					bind:value={row.count}
					aria-label="How many you own"
				/>
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
		<PlateDiagram tool={sampleTool} weight={Number(sampleWeight) || 0} {config} />
		<span class="num preview-text"
			>{loadingLabel(sampleTool, Number(sampleWeight) || 0, config)}</span
		>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding-top: 22px;
	}
	h2 {
		font-size: 30px;
		letter-spacing: -0.025em;
		margin: 0 auto 0 0;
	}
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
		grid-template-columns: 1fr 1fr 78px auto;
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
		gap: 14px;
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 12px 14px;
	}
	.preview-text {
		font-size: 12.5px;
		color: var(--color-neutral-500);
		min-width: 0;
	}
</style>
