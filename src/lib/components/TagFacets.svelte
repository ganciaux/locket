<script lang="ts">
	// Filtre par tags en facettes : une pastille par catégorie (« Autres » pour les tags sans catégorie),
	// qui ouvre la liste de ses tags à cocher, plus « Non renseigné » (aucun tag de la catégorie),
	// et résume la sélection (« Genre : Combat +1 »).
	// Le sens du filtre (OU dans une catégorie, ET entre catégories) est celui de `matchesFilter`.
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { type Tag, type TagGroup, groupTags } from '$lib/entries/model';

	let {
		tags,
		groups,
		selected = $bindable([]),
		missing = $bindable([]),
		onchange,
		before
	}: {
		tags: Tag[];
		groups: TagGroup[];
		selected?: string[];
		/** Catégories dont « Non renseigné » est coché. */
		missing?: string[];
		onchange?: () => void;
		/** Pastilles supplémentaires affichées en tête (ex. « Sans tag »). */
		before?: Snippet;
	} = $props();

	const facets = $derived(
		groupTags(tags, groups).map((section) => ({
			key: section.group?.id ?? '',
			name: section.group?.name ?? 'Autres',
			tags: section.tags,
			// « Non renseigné » n'a de sens que pour une vraie catégorie.
			canMiss: !!section.group
		}))
	);

	// Une seule liste ouverte à la fois ; clic à l'extérieur ou Échap la ferment (<details> ne le fait pas seul).
	let openKey = $state<string | null>(null);

	function closeOutside(event: MouseEvent) {
		if (openKey === null) return;
		const facet = (event.target as Element).closest?.('details[data-facet]') as HTMLElement | null;
		if (facet?.dataset.facet !== openKey) openKey = null;
	}

	const without = (list: string[], value: string) => list.filter((item) => item !== value);

	function toggle(id: string) {
		selected = selected.includes(id) ? without(selected, id) : [...selected, id];
		onchange?.();
	}

	function toggleMissing(key: string) {
		missing = missing.includes(key) ? without(missing, key) : [...missing, key];
		onchange?.();
	}

	function clear(key: string, facetTags: Tag[]) {
		selected = selected.filter((id) => !facetTags.some((tag) => tag.id === id));
		missing = without(missing, key);
		onchange?.();
	}
</script>

<svelte:window onclick={closeOutside} onkeydown={(e) => e.key === 'Escape' && (openKey = null)} />

<div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par tags">
	{@render before?.()}
	{#each facets as facet (facet.key)}
		{@const chosen = [
			...facet.tags.filter((tag) => selected.includes(tag.id)).map((tag) => tag.name),
			...(missing.includes(facet.key) ? ['Non renseigné'] : [])
		]}
		<details
			class="dropdown"
			data-facet={facet.key}
			open={openKey === facet.key}
			ontoggle={(e) => {
				if (e.currentTarget.open) openKey = facet.key;
				else if (openKey === facet.key) openKey = null;
			}}
		>
			<summary
				class="badge badge-lg max-w-64 cursor-pointer list-none gap-1 [&::-webkit-details-marker]:hidden {chosen.length
					? 'badge-primary'
					: 'badge-outline'}"
				aria-label="{facet.name}{chosen.length ? ` : ${chosen.join(', ')}` : ''}"
			>
				<span class="truncate">
					{facet.name}{#if chosen.length}&nbsp;: {chosen[0]}{/if}
				</span>
				{#if chosen.length > 1}<span class="shrink-0">+{chosen.length - 1}</span>{/if}
				<Icon name="chevronDown" class="size-3 shrink-0" />
			</summary>
			<div class="dropdown-content bg-base-100 rounded-box z-20 mt-1 flex w-56 max-w-[calc(100vw-2rem)] flex-col p-2 shadow-lg">
				<ul class="flex max-h-72 flex-col overflow-y-auto" role="group" aria-label="Tags {facet.name}">
					{#each facet.tags as tag (tag.id)}
						<li>
							<label class="hover:bg-base-200 rounded-field flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
								<input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									checked={selected.includes(tag.id)}
									onchange={() => toggle(tag.id)}
								/>
								<span class="min-w-0 flex-1 break-words">{tag.name}</span>
							</label>
						</li>
					{/each}
					{#if facet.canMiss}
						<li class="border-base-200 mt-1 border-t pt-1">
							<label class="hover:bg-base-200 rounded-field flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm italic">
								<input
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									checked={missing.includes(facet.key)}
									onchange={() => toggleMissing(facet.key)}
								/>
								<span class="flex-1">Non renseigné</span>
							</label>
						</li>
					{/if}
				</ul>
				<div class="border-base-200 mt-1 flex justify-between border-t pt-2">
					<button type="button" class="btn btn-ghost btn-xs" disabled={!chosen.length} onclick={() => clear(facet.key, facet.tags)}>Effacer</button>
					<button type="button" class="btn btn-primary btn-xs" onclick={() => (openKey = null)}>Fermer</button>
				</div>
			</div>
		</details>
	{/each}
</div>
