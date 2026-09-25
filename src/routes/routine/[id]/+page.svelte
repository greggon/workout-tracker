<script lang="ts">
	import DayEditor from '$lib/routine/DayEditor.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{data.day.title}</title>
</svelte:head>

{#key data.day.id}
	<DayEditor day={data.day} catalog={data.catalog} loading={data.loading} back={data.back} {form} />
{/key}
