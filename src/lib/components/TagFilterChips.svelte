<script lang="ts">
	// Filtre par tags, partagé par la recherche et l'index (chacun son filtre) : une pastille par catégorie (facettes),
	// ou tous les tags à plat sans catégorie, précédés de « Sans tag ». OU dans une catégorie, ET entre catégories.
	import TagFacets from '$lib/components/TagFacets.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { type TagFilter, filterableTags } from '$lib/entries/model';
	import { entries } from '$lib/entries/store.svelte';

	// `filter` lié (`bind:filter`) : le composant le modifie en place.
	let { filter = $bindable(), extended }: { filter: TagFilter; extended: boolean } = $props();

	// « Sans tag » et les tags sélectionnés s'excluent : cocher l'un décoche l'autre.
	function toggleUntagged() {
		filter.untagged = !filter.untagged;
		if (filter.untagged) {
			filter.tagIds = [];
			filter.missing = [];
		}
	}
</script>

{#snippet untaggedChip()}
	<button
		type="button"
		class="badge badge-lg cursor-pointer italic badge-primary {filter.untagged ? '' : 'badge-outline border-dashed'}"
		aria-pressed={filter.untagged}
		onclick={toggleUntagged}
	>
		Sans tag
	</button>
{/snippet}

{#if entries.tags?.length && entries.tagGroups.length}
	<TagFacets
		tags={entries.tags}
		groups={entries.tagGroups}
		bind:selected={filter.tagIds}
		bind:missing={filter.missing}
		{extended}
		onchange={() => (filter.tagIds.length || filter.missing.length) && (filter.untagged = false)}
		before={untaggedChip}
	/>
{:else if entries.tags?.length}
	<TagPicker
		tags={filterableTags(entries.tags, extended, filter.tagIds)}
		bind:selected={filter.tagIds}
		label="Filtrer par tags"
		onchange={(selected) => selected.length && (filter.untagged = false)}
		before={untaggedChip}
	/>
{/if}
