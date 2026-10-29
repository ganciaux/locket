<script lang="ts">
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { NO_TAG_FILTER, type TagFilter, linkTitle } from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let query = $state('');
	let tagFilter = $state<TagFilter>({ ...NO_TAG_FILTER });
	let error = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const results = $derived(entries.search(query, tagFilter));
	const tagFiltering = $derived(tagFilter.untagged || tagFilter.tagIds.length > 0);
	const filtering = $derived(!!query.trim() || tagFiltering);

	// « Sans tag » et les tags sélectionnés s'excluent : cocher l'un décoche l'autre.
	function toggleUntagged() {
		tagFilter.untagged = !tagFilter.untagged;
		if (tagFilter.untagged) tagFilter.tagIds = [];
	}
</script>

<div class="mb-4 flex items-center gap-2">
	<h1 class="text-2xl font-bold">Mes fiches</h1>
	{#if entries.items?.length}<span class="badge badge-ghost">{entries.items.length}</span>{/if}
	<a class="btn btn-ghost btn-sm ml-auto" href="/fiche/import"><Icon name="import" class="size-4" /> Importer</a>
</div>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.items?.length === 0}
	<div class="flex flex-col items-center gap-4 py-16 text-center">
		<Icon name="image" class="text-base-content/30 size-16" />
		<p class="text-base-content/70">Aucune fiche pour l'instant.</p>
		<a class="btn btn-primary" href="/fiche/nouvelle"><Icon name="plus" /> Créer ma première fiche</a>
	</div>
{:else if entries.items}
	<label class="input mb-3 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input type="search" placeholder="Rechercher (nom ou tag)" aria-label="Rechercher" bind:value={query} />
	</label>

	{#if entries.tags?.length}
		<div class="mb-4 flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<span class="text-base-content/60 text-xs">Tags</span>
				<div class="join" role="radiogroup" aria-label="Mode de filtre des tags">
					<input
						class="join-item btn btn-xs"
						type="radio"
						name="tag-mode"
						value="or"
						aria-label="OU"
						title="Au moins un des tags sélectionnés"
						bind:group={tagFilter.mode}
					/>
					<input
						class="join-item btn btn-xs"
						type="radio"
						name="tag-mode"
						value="and"
						aria-label="ET"
						title="Tous les tags sélectionnés"
						bind:group={tagFilter.mode}
					/>
				</div>
				{#if tagFiltering}
					<button class="btn btn-ghost btn-xs ml-auto" onclick={() => (tagFilter = { ...NO_TAG_FILTER, mode: tagFilter.mode })}>
						Effacer
					</button>
				{/if}
			</div>
			<TagPicker
				tags={entries.tags}
				bind:selected={tagFilter.tagIds}
				label="Filtrer par tags"
				onchange={(selected) => selected.length && (tagFilter.untagged = false)}
			>
				{#snippet before()}
					<button
						type="button"
						class="badge badge-lg cursor-pointer italic {tagFilter.untagged ? 'badge-neutral' : 'badge-outline badge-neutral'}"
						aria-pressed={tagFilter.untagged}
						onclick={toggleUntagged}
					>
						Sans tag
					</button>
				{/snippet}
			</TagPicker>
		</div>
	{/if}

	{#if results.length === 0 && filtering}
		<p class="text-base-content/60 py-8 text-center">Aucune fiche ne correspond.</p>
	{/if}

	<!-- items-start : une carte dont on ouvre les liens s'allonge sans étirer ses voisines. -->
	<ul class="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-4">
		{#each results as entry (entry.id)}
			<li class="card bg-base-100 overflow-hidden shadow-sm transition hover:shadow-md">
				<a href="/fiche/{entry.id}" class="block">
					<figure class="bg-primary/10 aspect-square">
						{#if entry.thumbUrl}
							<img src={entry.thumbUrl} alt="" class="size-full object-cover" />
						{:else}
							<span class="text-primary text-5xl font-bold" aria-hidden="true">
								{entry.name.charAt(0).toUpperCase()}
							</span>
						{/if}
					</figure>
					<h2 class="truncate px-3 pt-3 pb-2 text-sm font-semibold">{entry.name}</h2>
					{#if entry.tagIds?.length}
						{@const entryTags = entries.tagsOf(entry)}
						<div class="flex flex-wrap gap-1 px-3 pb-2">
							{#each entryTags.slice(0, 3) as tag (tag.id)}
								<span class="badge badge-soft badge-primary badge-xs">{tag.name}</span>
							{/each}
							{#if entryTags.length > 3}<span class="badge badge-ghost badge-xs">+{entryTags.length - 3}</span>{/if}
						</div>
					{/if}
				</a>

				<!-- Hors du lien de la carte : on ne peut pas imbriquer des éléments cliquables dans un <a>. -->
				{#if entry.links.length}
					<details class="group border-base-200 border-t">
						<summary
							class="text-base-content/60 hover:bg-base-200 flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden"
						>
							<Icon name="link" class="size-3" />
							<span class="flex-1">{entry.links.length} lien{entry.links.length > 1 ? 's' : ''}</span>
							<Icon name="chevronDown" class="size-4 transition group-open:rotate-180" />
						</summary>
						<ul class="flex flex-col gap-1 px-3 pb-3 text-sm">
							{#each entry.links as link, i (i)}
								<li class="truncate"><ExternalLink url={link.url}>{linkTitle(link)}</ExternalLink></li>
							{/each}
						</ul>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<a
	href="/fiche/nouvelle"
	class="btn btn-primary btn-circle btn-lg fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg"
	aria-label="Nouvelle fiche"
	title="Nouvelle fiche"
>
	<Icon name="plus" class="size-7" />
</a>
