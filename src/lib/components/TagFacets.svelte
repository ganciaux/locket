<script lang="ts">
	// Filtre par tags en facettes : une pastille par catégorie (« Autres » pour les tags sans catégorie),
	// qui ouvre la liste de ses tags à cocher, plus « Non renseigné » (aucun tag de la catégorie),
	// et résume la sélection (« Genre : Combat +1 »).
	// Le sens du filtre (OU dans une catégorie, ET entre catégories) est celui de `matchesFilter`.
	// Sans `extended`, seuls les catégories et les tags en recherche simple sont proposés (voir `facetShown`) ;
	// une catégorie dont aucun tag n'est proposé disparaît, sauf si quelque chose y est coché.
	import type { Snippet } from 'svelte';
	import FacetDropdown, { type FacetOption } from '$lib/components/FacetDropdown.svelte';
	import { type Tag, type TagGroup, facetShown, filterLevel, filterableTags, groupTags } from '$lib/entries/model';

	let {
		tags,
		groups,
		selected = $bindable([]),
		missing = $bindable([]),
		extended = true,
		onchange,
		before
	}: {
		tags: Tag[];
		groups: TagGroup[];
		selected?: string[];
		/** Catégories dont « Non renseigné » est coché. */
		missing?: string[];
		/** Recherche avancée : les catégories et les tags « avancés » sont aussi proposés. */
		extended?: boolean;
		onchange?: () => void;
		/** Pastilles supplémentaires affichées en tête (ex. « Sans tag »). */
		before?: Snippet;
	} = $props();

	// Filtrées après `groupTags` : retirer une catégorie avant rangerait ses tags dans « Autres ».
	const facets = $derived(
		groupTags(tags, groups)
			.map((section) => ({
				key: section.group?.id ?? '',
				group: section.group,
				name: section.group?.name ?? 'Autres',
				tags: filterableTags(section.tags, extended, selected),
				// « Non renseigné » n'a de sens que pour une vraie catégorie.
				canMiss: !!section.group
			}))
			.filter((facet) => {
				const active = missing.includes(facet.key) || facet.tags.some((tag) => selected.includes(tag.id));
				return active || (facet.tags.length > 0 && facetShown(filterLevel(facet.group), extended, false));
			})
	);

	// Dans une facette, « Non renseigné » est une option comme les tags ; un id de tag est un UUID, sans « : ».
	const MISSING = ':missing';

	const optionsOf = (facet: (typeof facets)[number]): FacetOption[] => [
		...facet.tags.map((tag) => ({ value: tag.id, label: tag.name })),
		...(facet.canMiss ? [{ value: MISSING, label: 'Non renseigné', extra: true }] : [])
	];

	const selectedIn = (facet: (typeof facets)[number]) => [
		...facet.tags.filter((tag) => selected.includes(tag.id)).map((tag) => tag.id),
		...(missing.includes(facet.key) ? [MISSING] : [])
	];

	function change(facet: (typeof facets)[number], next: string[]) {
		const own = new Set(facet.tags.map((tag) => tag.id));
		selected = [...selected.filter((id) => !own.has(id)), ...next.filter((value) => value !== MISSING)];
		missing = next.includes(MISSING) ? [...new Set([...missing, facet.key])] : missing.filter((key) => key !== facet.key);
		onchange?.();
	}
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par tags">
	{@render before?.()}
	{#each facets as facet (facet.key)}
		<FacetDropdown name={facet.name} options={optionsOf(facet)} selected={selectedIn(facet)} onchange={(next) => change(facet, next)} />
	{/each}
</div>
