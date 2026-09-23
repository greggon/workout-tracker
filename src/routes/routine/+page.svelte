<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { MAX_SPLIT, MIN_SPLIT } from '$lib/types';
	import ReorderButtons from '$lib/ui/ReorderButtons.svelte';
	import { formatVolume } from '$lib/volume';

	let { data, form } = $props();

	const splitOptions = Array.from({ length: MAX_SPLIT - MIN_SPLIT + 1 }, (_, i) => MIN_SPLIT + i);

	/**
	 * Writable derived: reordering assigns to it so the list moves immediately,
	 * and it snaps back to the server's order once the action returns.
	 */
	let order = $derived(data.days.map((d) => d.id));

	const ordered = $derived(
		order.map((id) => data.days.find((d) => d.id === id)).filter((d) => d !== undefined)
	);

	let reorderForm: HTMLFormElement;

	/**
	 * Reordering is a mode. Each row used to carry its arrows and an "Edit day"
	 * button all the time, which on a phone wrapped every row onto two lines;
	 * now a row is one link to its editor, and the arrows come out only when
	 * asked for.
	 */
	let reordering = $state(false);

	function move(index: number, delta: number) {
		const to = index + delta;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[index], next[to]] = [next[to], next[index]];
		order = next;
		// The submitted value is filled in from `order` at submit time rather
		// than read out of the DOM — see the form below.
		reorderForm.requestSubmit();
	}
</script>

<svelte:head>
	<title>My Routine</title>
</svelte:head>

{#if form?.message}
	<p class="notice notice-error" role="alert">{form.message}</p>
{/if}

<h2 class="section-label">Split</h2>
<form method="POST" action="?/split" use:enhance class="seg split">
	{#each splitOptions as size (size)}
		<label class="seg-opt">
			<input
				type="radio"
				name="size"
				value={size}
				checked={data.days.length === size}
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			/>
			<span>{size} days</span>
		</label>
	{/each}
</form>
<p class="text-muted hint">
	Removing days drops them from the end of the rotation. Past sessions keep their history.
</p>

<div class="section-head">
	<h2 class="section-label">Days · in rotation order</h2>
	{#if ordered.length > 1}
		<button
			type="button"
			class="btn btn-ghost reorder-toggle"
			aria-pressed={reordering}
			onclick={() => (reordering = !reordering)}
		>
			{reordering ? 'Done' : 'Reorder'}
		</button>
	{/if}
</div>

<!--
	The order is written into the submission here, not read back out of the
	hidden input. Svelte flushes state to the DOM on a microtask, so a
	`requestSubmit()` fired straight after assigning `order` would post the
	*previous* value — the server would then apply no change, the load would
	revalidate identically, and the list would visibly snap back.
-->
<form
	method="POST"
	action="?/reorder"
	bind:this={reorderForm}
	use:enhance={({ formData }) => {
		formData.set('order', order.join(','));
	}}
>
	<input type="hidden" name="order" value={order.join(',')} />
</form>

<ul class="list-group">
	{#each ordered as day, i (day.id)}
		<li>
			{#if reordering}
				<div class="row-card">
					<span class="badge badge-quiet">{day.key}</span>
					<span class="text">
						<span class="title">{day.title}</span>
					</span>
					<ReorderButtons
						name={day.title}
						first={i === 0}
						last={i === ordered.length - 1}
						onmove={(delta) => move(i, delta)}
					/>
				</div>
			{:else}
				<a class="row-card" href={resolve('/routine/[id]', { id: day.id })}>
					<span class="badge badge-quiet">{day.key}</span>
					<span class="text">
						<span class="title">{day.title}</span>
						<span class="meta num">
							{day.exerciseCount} exercises · {day.sets} sets · {formatVolume(day.volume)} lb
						</span>
					</span>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="chev"
						aria-hidden="true"
					>
						<path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
					</svg>
				</a>
			{/if}
		</li>
	{/each}
</ul>

<style>
	/* M3 segmented buttons, stretched across the column: one segment per
	   split size. */
	.split {
		display: flex;
		width: 100%;
	}
	.split .seg-opt {
		flex: 1;
		min-width: 0;
		padding-inline: 6px;
	}
	.hint {
		font-size: var(--text-sm);
		margin: 8px 0 0;
	}

	/* The heading shares its row with the Reorder toggle, so the row carries the
	   section spacing and the heading inside it drops its own. */
	.section-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 28px 0 12px;
	}
	.section-head .section-label {
		flex: 1;
		min-width: 0;
		margin: 0;
	}
	.reorder-toggle {
		flex: none;
		/* Keeps a 48px target without pushing the heading row taller. */
		margin-block: -14px;
	}

	.text {
		flex: 1;
		min-width: 0;
	}
	.title {
		display: block;
		font-size: var(--text-base);
		line-height: 24px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: block;
		font-size: var(--text-md);
		color: var(--md-on-surface-variant);
	}
</style>
