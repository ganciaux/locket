<script lang="ts">
	// Pastilles de tags à cocher : choix des tags d'une fiche, ou filtre de la liste.
	// Avec des catégories, une ligne par catégorie (titre puis pastilles) ; sinon une seule ligne.
	import type { Snippet } from 'svelte';
	import { type Tag, type TagGroup, borderColor, borderTags, groupTags } from '$lib/entries/model';

	let {
		tags,
		groups = [],
		selected = $bindable([]),
		label,
		onchange,
		before,
		single = false
	}: {
		tags: Tag[];
		groups?: TagGroup[];
		selected?: string[];
		label: string;
		onchange?: (selected: string[]) => void;
		/** Pastilles supplémentaires affichées en tête (ex. « Sans tag »). */
		before?: Snippet;
		/** Choix des tags d'une fiche : un seul tag de la catégorie de bordure (cocher l'un décoche l'autre). Pas pour un filtre. */
		single?: boolean;
	} = $props();

	const sections = $derived(groupTags(tags, groups));
	const bordered = $derived(borderTags(tags, groups));
	const exclusive = $derived(single ? bordered.map((tag) => tag.id) : []);
	// Pastille de couleur devant les tags de la catégorie de bordure.
	const swatches = $derived(new Map(bordered.map((tag) => [tag.id, borderColor(tag.color)?.swatch])));

	function toggle(id: string) {
		if (selected.includes(id)) selected = selected.filter((s) => s !== id);
		else selected = [...selected.filter((s) => !exclusive.includes(id) || !exclusive.includes(s)), id];
		onchange?.(selected);
	}
</script>

{#snippet badges(list: Tag[])}
	{#each list as tag (tag.id)}
		{@const active = selected.includes(tag.id)}
		<button
			type="button"
			class="badge badge-lg cursor-pointer badge-primary {active ? '' : 'badge-outline'}"
			aria-pressed={active}
			onclick={() => toggle(tag.id)}
		>
			{#if swatches.get(tag.id)}<span class="size-2.5 rounded-full {swatches.get(tag.id)}" aria-hidden="true"></span>{/if}
			{tag.name}
		</button>
	{/each}
{/snippet}

{#if groups.length}
	<div class="flex flex-col gap-2" role="group" aria-label={label}>
		{#if before}<div class="flex flex-wrap gap-2">{@render before()}</div>{/if}
		{#each sections as section (section.group?.id ?? '')}
			<div class="flex flex-wrap items-center gap-2" role="group" aria-label={section.group?.name ?? 'Sans catégorie'}>
				<span class="text-base-content/60 w-full text-xs font-medium">{section.group?.name ?? 'Sans catégorie'}</span>
				{@render badges(section.tags)}
			</div>
		{/each}
	</div>
{:else}
	<div class="flex flex-wrap gap-2" role="group" aria-label={label}>
		{@render before?.()}
		{@render badges(tags)}
	</div>
{/if}
