<script lang="ts">
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let query = $state('');
	let error = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const results = $derived(entries.search(query));
</script>

<div class="mb-4 flex items-baseline gap-2">
	<h1 class="text-2xl font-bold">Mes fiches</h1>
	{#if entries.items?.length}<span class="badge badge-ghost">{entries.items.length}</span>{/if}
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
	<label class="input mb-4 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input type="search" placeholder="Rechercher par nom" aria-label="Rechercher" bind:value={query} />
	</label>

	{#if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">Aucune fiche ne correspond à « {query} ».</p>
	{/if}

	<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
		{#each results as entry (entry.id)}
			<li>
				<a
					href="/fiche/{entry.id}"
					class="card bg-base-100 h-full overflow-hidden shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
				>
					<figure class="bg-primary/10 aspect-square">
						{#if entry.thumbUrl}
							<img src={entry.thumbUrl} alt="" class="size-full object-cover" />
						{:else}
							<span class="text-primary text-5xl font-bold" aria-hidden="true">
								{entry.name.charAt(0).toUpperCase()}
							</span>
						{/if}
					</figure>
					<div class="card-body p-3">
						<h2 class="truncate text-sm font-semibold">{entry.name}</h2>
						{#if entry.links.length}
							<p class="text-base-content/60 flex items-center gap-1 text-xs">
								<Icon name="link" class="size-3" />
								{entry.links.length} lien{entry.links.length > 1 ? 's' : ''}
							</p>
						{/if}
					</div>
				</a>
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
