<script lang="ts">
	let { message }: { message: string } = $props();
</script>

{#if message}
	<p role="alert" class="alert alert-error alert-soft text-sm">{message}</p>
{/if}
