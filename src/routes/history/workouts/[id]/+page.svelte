<script lang="ts">
	import WorkoutEditor from '$lib/history/WorkoutEditor.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Edit workout</title></svelte:head>

<!-- A save reloads the workout; keying on it starts the editor over from what
     was stored rather than keeping the pre-save edits in memory. -->
{#key data.workout}
	<WorkoutEditor workout={data.workout} {form} />
{/key}
