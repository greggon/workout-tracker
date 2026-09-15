<script lang="ts">
	import WorkoutScreen from '$lib/workout/WorkoutScreen.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.day.key} day</title>
</svelte:head>

{#key data.day.id}
	<WorkoutScreen day={data.day} lastLogs={data.lastLogs} config={data.loading} />
{/key}
