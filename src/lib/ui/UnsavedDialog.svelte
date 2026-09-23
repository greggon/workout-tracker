<script lang="ts">
	/**
	 * The "not saved" sheet UnsavedGuard raises. Three ways out: save and carry
	 * on, throw the edits away, or stay. Markup order is the desktop row's —
	 * stay, discard, save — and app.css stacks it confirm-first on a phone.
	 */
	type Props = {
		title: string;
		text: string;
		onstay: () => void;
		ondiscard: () => void;
		onsave: () => void;
		saveLabel?: string;
		saveDisabled?: boolean;
	};
	let {
		title,
		text,
		onstay,
		ondiscard,
		onsave,
		saveLabel = 'Save and go',
		saveDisabled = false
	}: Props = $props();
</script>

<div class="dialog-backdrop">
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
		<h2 class="dialog-title" id="unsaved-title">{title}</h2>
		<p class="text-muted text">{text}</p>
		<div class="dialog-actions">
			<button type="button" class="btn btn-secondary" onclick={onstay}>Keep editing</button>
			<button type="button" class="btn btn-danger" onclick={ondiscard}>Discard changes</button>
			<button type="button" class="btn btn-primary" onclick={onsave} disabled={saveDisabled}>
				{saveLabel}
			</button>
		</div>
	</div>
</div>

<style>
	.text {
		font-size: var(--text-md);
		margin: 0;
	}
</style>
