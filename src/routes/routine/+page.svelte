<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { MAX_SPLIT, MIN_SPLIT } from '$lib/types';
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

	function move(index: number, delta: number) {
		const to = index + delta;
		if (to < 0 || to >= order.length) return;
		const next = [...order];
		[next[index], next[to]] = [next[to], next[index]];
		order = next;
		reorderForm.requestSubmit();
	}
</script>

<svelte:head>
	<title>My routine</title>
</svelte:head>

<div class="head">
	<h2>My routine</h2>
	<a class="btn btn-ghost" href={resolve('/settings')}>Equipment</a>
	<a class="btn btn-ghost" href={resolve('/')}>Done</a>
</div>

{#if form?.message}
	<p class="error" role="alert">{form.message}</p>
{/if}

<h6 class="label">Split</h6>
<form method="POST" action="?/split" use:enhance class="seg">
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

<h6 class="label">Days · in rotation order</h6>

<form method="POST" action="?/reorder" use:enhance bind:this={reorderForm}>
	<input type="hidden" name="order" value={order.join(',')} />
</form>

<ul class="days">
	{#each ordered as day, i (day.id)}
		<li class="day">
			<div class="arrows">
				<button
					class="btn btn-secondary btn-icon arrow"
					onclick={() => move(i, -1)}
					disabled={i === 0}
					aria-label="Move {day.title} earlier"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"><path d="m6 15 6-6 6 6" /></svg
					>
				</button>
				<button
					class="btn btn-secondary btn-icon arrow"
					onclick={() => move(i, 1)}
					disabled={i === ordered.length - 1}
					aria-label="Move {day.title} later"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"><path d="m6 9 6 6 6-6" /></svg
					>
				</button>
			</div>

			<span class="badge">{day.key}</span>

			<span class="text">
				<span class="title">{day.title}</span>
				<span class="meta num">
					{day.exerciseCount} exercises · {day.sets} sets · {formatVolume(day.volume)} lb planned
				</span>
			</span>

			<a class="btn btn-secondary edit" href={resolve('/routine/[id]', { id: day.id })}>Edit day</a>
		</li>
	{/each}
</ul>

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
	.label {
		color: var(--color-neutral-500);
		margin: 26px 0 10px;
	}
	.hint {
		font-size: 12px;
		margin: 10px 0 0;
	}
	.error {
		color: var(--color-accent-300);
		background: var(--color-accent-900);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		font-size: 13.5px;
	}

	.days {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.day {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 12px 14px;
	}

	/* The design draws a drag handle here. Explicit arrows work with a thumb,
	   a keyboard and a screen reader, which pointer-drag does not without a
	   great deal more machinery. */
	.arrows {
		display: grid;
		gap: 3px;
		flex: none;
	}
	.arrow {
		width: 30px;
		height: 22px;
		min-height: 0;
	}

	.badge {
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-md);
		display: grid;
		place-items: center;
		font-family: var(--font-heading);
		font-size: 15px;
		color: var(--color-neutral-300);
		background: var(--color-neutral-900);
	}

	.text {
		flex: 1;
		min-width: 0;
	}
	.title {
		display: block;
		font-family: var(--font-heading);
		font-weight: var(--font-heading-weight);
		font-size: 16px;
	}
	.meta {
		display: block;
		font-size: 12px;
		color: var(--color-neutral-500);
		margin-top: 2px;
	}
	.edit {
		flex: none;
		font-size: 12.5px;
		text-decoration: none;
	}

	@media (max-width: 520px) {
		.day {
			flex-wrap: wrap;
		}
		.edit {
			margin-left: auto;
		}
	}
</style>
