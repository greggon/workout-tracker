<script lang="ts">
	import { browser } from '$app/environment';
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

	/**
	 * Whether the color picker column is shown.
	 *
	 * Plate colors are set once and then left alone for months, so the column is
	 * mostly in the way of the numbers either side of it. The choice is
	 * remembered per device.
	 *
	 * Starts shown and is corrected on mount rather than read during setup: the
	 * server renders this page too, and initializing from localStorage would make
	 * the client's first render disagree with the server's HTML.
	 */
	const COLORS_KEY = 'workout.settings.colors';
	let showColors = $state(true);

	$effect(() => {
		try {
			showColors = localStorage.getItem(COLORS_KEY) !== 'hidden';
		} catch {
			// Private window or storage blocked. Shown is the right default.
		}
	});

	function toggleColors() {
		showColors = !showColors;
		if (!browser) return;
		try {
			localStorage.setItem(COLORS_KEY, showColors ? 'shown' : 'hidden');
		} catch {
			// The choice still applies for this visit; it just is not remembered.
		}
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

	<div class="section-head">
		<h6 class="label">Plates you own</h6>
		<button type="button" class="btn btn-ghost toggle" onclick={toggleColors}>
			{showColors ? 'Hide colors' : 'Show colors'}
		</button>
	</div>
	<p class="text-muted hint">
		Count the whole pile, not per side. A barbell splits it in two; a landmine or a machine loads
		one end, so the whole pile is available to it. Colors are how the plates look in your gym — the
		loading diagrams use them, so a stack is recognizable before you read the numbers.
	</p>

	<input type="hidden" name="rows" value={rows.length} />
	<ul class="plates" class:no-colors={!showColors}>
		<li class="plates-head">
			<span>Weight</span>
			<span>Count</span>
			{#if showColors}<span>Color</span>{/if}
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
				{#if showColors}
					<input
						class="swatch"
						type="color"
						name="color-{i}"
						value={row.color}
						oninput={(e) => update(i, { color: e.currentTarget.value })}
						aria-label="Color of the {row.weight} lb plates"
					/>
				{:else}
					<!--
						The color still has to be submitted while the picker is hidden.
						Without this the field is absent from the form, the server reads no
						color, and hiding the column would quietly repaint every plate
						black on the next save. A hidden input is display:none by the UA
						stylesheet, so it adds no grid cell.
					-->
					<input type="hidden" name="color-{i}" value={row.color} />
				{/if}
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
	/*
	 * One definition for both rows — but sharing the template is not enough on
	 * its own, because the heading row and the plate rows are separate grid
	 * containers and `auto` and `fr` tracks resolve against each container's own
	 * contents. The last column was `auto`: empty in the heading row (0px) and a
	 * Remove button in the plate rows (~52px). That difference went into the two
	 * `fr` columns, so every heading sat progressively further right than the
	 * value it labelled — COUNT by half the button, COLOR by all of it.
	 *
	 * Every track except the `fr` pair is now a fixed width, so both containers
	 * divide the same remaining space and the columns line up by arithmetic
	 * rather than by luck. Do not put `auto` back.
	 */
	.plates {
		--plate-cols: 1fr 1fr var(--swatch-w) var(--remove-w);
		/* Sized by the COLOR heading; the swatch fits whatever it is given. */
		--swatch-w: 58px;
		/* Sized by the Remove button at its 12px font. */
		--remove-w: 72px;
	}
	.plates.no-colors {
		--plate-cols: 1fr 1fr var(--remove-w);
	}
	.plates-head,
	.plate-row {
		display: grid;
		grid-template-columns: var(--plate-cols);
		gap: 8px;
		align-items: center;
	}
	/* A grid item's automatic minimum is its content, and an <input> carries an
	   intrinsic width of about twenty characters. Left at auto it can push its
	   own column wider than the share the template gave it, which would put the
	   two rows back out of step. */
	.plates-head > *,
	.plate-row > * {
		min-width: 0;
	}
	.plates-head {
		font-size: 10.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-neutral-600);
	}
	/*
	 * A heading labels the value, not the box around it. An .input puts a 1px
	 * border and 12px of padding before its text, so an unpadded heading sits 13px
	 * to the left of the number underneath it — which is what made this table look
	 * out of true. Only the two text columns need it; the swatch and the button
	 * fill their cells.
	 */
	.plates-head > span:nth-child(-n + 2) {
		padding-left: 13px;
	}
	/* A heading that outgrows its column would otherwise print straight over the
	   next one rather than being clipped by it. */
	.plates-head > span {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/*
	 * An unstyled <input type="color"> takes the browser's own dimensions, which
	 * are wider than this column — and a grid item wider than its track does not
	 * shrink, it spills over whatever comes next, which here was the Remove
	 * button. Sized to the track instead, so it cannot.
	 */
	.swatch {
		width: 100%;
		height: 34px;
		padding: 0;
		background: none;
		border: 1px solid var(--color-divider);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.swatch:hover {
		border-color: color-mix(in srgb, var(--color-text) 35%, transparent);
	}
	/* The color wells come with their own inset padding and border; without
	   these the plate's color shows as a small chip in a grey frame. */
	.swatch::-webkit-color-swatch-wrapper {
		padding: 2px;
	}
	.swatch::-webkit-color-swatch {
		border: 0;
		border-radius: 6px;
	}
	.swatch::-moz-color-swatch {
		border: 0;
		border-radius: 6px;
	}
	@media (pointer: coarse) {
		.swatch {
			height: 44px;
		}
	}

	.section-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.section-head .label {
		flex: 1;
		min-width: 0;
	}
	.toggle {
		flex: none;
		font-size: 12px;
	}
	.drop {
		font-size: 12px;
		color: var(--color-neutral-400);
		/* Fills its fixed track rather than sizing it, which is what keeps the
		   heading row and the plate rows on the same columns. */
		padding-inline: 0;
		justify-self: stretch;
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
	   deciding what color a plate is. */
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
