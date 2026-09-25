<script lang="ts">
	import { tapReps, type LogSource } from './session.svelte';

	/**
	 * One set's reps, as a chip.
	 *
	 * Tap: see tapReps — the target, then one fewer per tap, then cleared.
	 * Press and hold: the chip becomes a number field, for going over the
	 * target or jumping straight to a number. A digit typed while the chip has
	 * keyboard focus does the same, so the field is reachable without a
	 * pointer.
	 *
	 * Shared by the workout screen and the editor for past workouts, so a set is
	 * logged the same way whether it is happening now or being corrected later.
	 * Sits in a `.rep-row` (app.css), which lays the chips out one row per
	 * movement.
	 */
	type Props = {
		value: number | null | undefined;
		target: number;
		/** What the set is, for screen readers: "Close grip bench, set 2". */
		label: string;
		/** Six sets or more: smaller figures, to fit the row. */
		dense?: boolean;
		onchange: (reps: number | null, source: LogSource) => void;
		/** A typed number is finished — the field closed with a value. */
		oncommit?: () => void;
	};
	let { value, target, label, dense = false, onchange, oncommit }: Props = $props();

	const HOLD_MS = 450;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	/** Set when a hold opened the field, so the click that ends it is not a tap. */
	let held = false;
	let editing = $state(false);
	let draft = $state('');

	function startEdit(initial?: string) {
		draft = initial ?? (value == null ? '' : String(value));
		editing = true;
	}

	function press() {
		held = false;
		release();
		holdTimer = setTimeout(() => {
			holdTimer = null;
			held = true;
			startEdit();
		}, HOLD_MS);
	}

	function release() {
		if (holdTimer !== null) clearTimeout(holdTimer);
		holdTimer = null;
	}

	function tap() {
		if (held) {
			held = false;
			return;
		}
		onchange(tapReps(value ?? undefined, target), 'tap');
	}

	function chipKeydown(event: KeyboardEvent) {
		if (/^[0-9]$/.test(event.key)) {
			event.preventDefault();
			startEdit(event.key);
		}
	}

	function commit(raw: string) {
		if (!editing) return;
		editing = false;
		const trimmed = raw.trim();
		onchange(trimmed === '' ? null : Number(trimmed), 'typed');
		oncommit?.();
	}

	function fieldKeydown(event: KeyboardEvent) {
		const field = event.currentTarget as HTMLInputElement;
		// Enter, and the numeric keypad's Done, mean the number is finished.
		if (event.key === 'Enter') field.blur();
		if (event.key === 'Escape') editing = false;
	}

	/** Focuses the field as it appears, with its number selected to type over. */
	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	const aria = $derived(
		`${label}: ${value == null ? `not logged, target ${target}` : `${value} reps`}. ` +
			'Tap to log, tap again for one fewer, hold to type.'
	);

	$effect(() => () => release());
</script>

{#if editing}
	<input
		class="rep rep-field num"
		class:dense
		type="number"
		inputmode="numeric"
		min="0"
		value={draft}
		use:focusOnMount
		onblur={(e) => commit(e.currentTarget.value)}
		onkeydown={fieldKeydown}
		aria-label="Reps, {label}"
	/>
{:else}
	<button
		type="button"
		class="rep num"
		class:dense
		class:logged={value != null}
		class:under={value != null && value < target}
		onpointerdown={press}
		onpointerup={release}
		onpointerleave={release}
		onpointercancel={release}
		oncontextmenu={(e) => e.preventDefault()}
		onclick={tap}
		onkeydown={chipKeydown}
		aria-label={aria}
	>
		{value ?? target}
	</button>
{/if}

<style>
	.rep {
		flex: 0 1 48px;
		min-width: 0;
		height: 48px;
		padding: 0;
		border: 1px solid var(--md-outline-variant);
		border-radius: var(--radius-md);
		background: var(--md-surface);
		color: var(--md-outline);
		font-family: inherit;
		font-size: 18px;
		font-weight: 500;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}
	.rep.dense {
		font-size: 15px;
	}
	/* At the target. */
	.rep.logged {
		border-color: transparent;
		color: var(--md-on-primary);
		background: var(--md-primary);
	}
	/* Short of it: a different color, so a missed rep reads at a glance. */
	.rep.under {
		color: var(--md-on-tertiary-container);
		background: var(--md-tertiary-container);
		font-weight: 600;
	}
	.rep-field {
		flex-basis: 56px;
		border: 2px solid var(--md-primary);
		color: var(--md-on-surface);
		background: var(--md-surface-container-lowest);
		text-align: center;
		cursor: text;
		-webkit-user-select: text;
		user-select: text;
		outline: none;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.rep-field::-webkit-outer-spin-button,
	.rep-field::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
