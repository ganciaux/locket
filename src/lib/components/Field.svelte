<script lang="ts">
	// Libellé + champ (+ aide facultative) : évite de répéter la même structure dans chaque formulaire.
	import type { Snippet } from 'svelte';

	let { label, hint, children }: { label: string; hint?: string; children: Snippet } = $props();
</script>

<label class="flex flex-col gap-1">
	<span class="text-sm font-medium">{label}</span>
	{@render children()}
	{#if hint}<span class="text-base-content/60 text-xs">{hint}</span>{/if}
</label>
