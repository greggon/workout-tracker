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

<ul class="days">
	{#each ordered as day, i (day.id)}
		<li>
			{#if reordering}
				<div class="row-card day moving">
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
				<a class="row-card day" href={resolve('/routine/[id]', { id: day.id })}>
					<span class="badge badge-quiet">{day.key}</span>
					<span class="text">
						<span class="title">{day.title}</span>
						<span class="meta num">
							{day.exerciseCount} exercises · {day.sets} sets · {formatVolume(day.volume)} lb
						</span>
					</span>
					<svg
						width="17"
						height="17"
						viewBox="0 0 256 256"
						fill="currentColor"
						class="chev"
						aria-hidden="true"
					>
						<path
							d="M181.7 133.7l-80 80a8 8 0 0 1-11.4-11.4L164.7 128 90.3 53.7a8 8 0 0 1 11.4-11.4l80 80a8 8 0 0 1 0 11.4Z"
						/>
					</svg>
				</a>
			{/if}
		</li>
	{/each}
</ul>

<style>
	/*
	 * The split picker as a card rather than the shared pill: it is the page's
	 * first section, and every other section here is a full-width card, so a
	 * short pill floating on the page ground was the odd one out. The `.seg`
	 * utility keeps its own shape for anywhere else that wants it.
	 */
	.split {
		display: flex;
		width: 100%;
		gap: 5px;
		padding: 5px;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
	}
	.split .seg-opt {
		flex: 1;
		min-width: 0;
		justify-content: center;
		padding: 11px 6px;
		font-size: var(--text-md);
		border-radius: var(--radius-md);
	}
	/* The hairline between options belongs to the pill; inside a card the
	   selected chip is what separates them. */
	.split .seg-opt + .seg-opt {
		border-left: 0;
	}
	@media (pointer: coarse) {
		.split .seg-opt {
			min-height: 44px;
		}
	}
	.hint {
		font-size: var(--text-sm);
		margin: 10px 0 0;
	}

	/* The heading shares its row with the Reorder toggle, so the row carries the
	   section spacing and the heading inside it drops its own. */
	.section-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 28px 0 10px;
	}
	.section-head .section-label {
		flex: 1;
		min-width: 0;
		margin: 0;
	}
	.reorder-toggle {
		flex: none;
		font-size: var(--text-md);
		/* Keeps a 44px target without pushing the heading row taller. */
		margin-block: -12px;
	}

	.days {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.moving {
		padding-block: 10px;
		box-shadow:
			inset 0 0 0 1px var(--color-accent-600),
			var(--shadow-sm);
	}

	.text {
		flex: 1;
		min-width: 0;
	}
	.title {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		display: block;
		font-size: var(--text-sm);
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
</style>
