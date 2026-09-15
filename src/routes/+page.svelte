<script lang="ts">
	let { data } = $props();

	const plates = $derived(
		data.user.plateInventory.map((p) => (Number.isInteger(p) ? p : p.toFixed(1)))
	);
</script>

<svelte:head>
	<title>Workout</title>
</svelte:head>

<section>
	<div class="kicker">Signed in</div>
	<h2>{data.user.displayName || data.user.email}</h2>
	<p class="text-muted sub">
		Cloudflare Access verified this session and resolved it to your account. The routine screens
		arrive next.
	</p>

	<div class="grid">
		<div class="card elev-sm">
			<div class="card-kicker">Account</div>
			<div class="card-title">{data.user.email}</div>
			<div class="card-meta">Provisioned on first verified request</div>
		</div>

		<div class="card elev-sm">
			<div class="card-kicker">Bar</div>
			<div class="card-title num">{data.user.barWeight} lb</div>
			<div class="card-meta">Subtracted before the per-side plate fill</div>
		</div>
	</div>

	<h6 class="section-label">Your plates</h6>
	<ul class="plates">
		{#each plates as plate (plate)}
			<li class="tag tag-neutral num">{plate} lb</li>
		{/each}
	</ul>
	<p class="text-muted note">
		The plate diagrams load from this inventory, so they only ever ask for a plate you own.
	</p>
</section>

<style>
	section {
		padding-top: 22px;
	}
	.kicker {
		font-size: 9.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 6px;
	}
	h2 {
		font-size: 30px;
		letter-spacing: -0.025em;
		margin: 0 0 8px;
	}
	.sub {
		max-width: 46ch;
		margin: 0 0 26px;
		font-size: 15px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 12px;
		margin-bottom: 30px;
	}

	.section-label {
		color: var(--color-neutral-500);
		margin: 0 0 10px;
	}
	.plates {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 10px;
		padding: 0;
		list-style: none;
	}
	.note {
		font-size: 12.5px;
		margin: 0;
	}
</style>
