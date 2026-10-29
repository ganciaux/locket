<script lang="ts">
	// Pastilles de tags à cocher : choix des tags d'une fiche, ou filtre de la liste.
	import type { Snippet } from 'svelte';
	import type { Tag } from '$lib/entries/model';

	let {
		tags,
		selected = $bindable([]),
		label,
		onchange,
		before
	}: {
		tags: Tag[];
		selected?: string[];
		label: string;
		onchange?: (selected: string[]) => void;
		/** Pastilles supplémentaires affichées en tête (ex. « Sans tag »). */
		before?: Snippet;
	} = $props();

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
		onchange?.(selected);
	}
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label={label}>
	{@render before?.()}
	{#each tags as tag (tag.id)}
		{@const active = selected.includes(tag.id)}
		<button
			type="button"
			class="badge badge-lg cursor-pointer {active ? 'badge-primary' : 'badge-outline'}"
			aria-pressed={active}
			onclick={() => toggle(tag.id)}
		>
			{tag.name}
		</button>
	{/each}
</div>
