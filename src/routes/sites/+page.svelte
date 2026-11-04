<script lang="ts">
	// Liens de la collection active : ses sites (modèles d'URL), comme la page Tags (sélecteur en haut).
	import { page } from '$app/state';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import SiteManager from '$lib/components/SiteManager.svelte';
	import { selectCollection } from '$lib/entries/collections';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');

	// Depuis les paramètres : sélecteur de collection et retour aux paramètres ;
	// sinon en-tête des pages de la collection (son menu, retour aux fiches).
	const fromSettings = $derived(page.url.searchParams.get('from') === 'settings');

	loadEntries().catch((e) => (error = errorMessage(e)));
</script>

{#if fromSettings}
	<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
	<h1 class="mb-1 text-2xl font-bold">Liens</h1>
{:else}
	<CollectionHeader />
	<h2 class="mb-1 text-xl font-bold">Liens</h2>
{/if}
<p class="text-base-content/60 mb-4 text-sm">Sites de la collection : chaque fiche y reçoit un lien calculé à partir de son nom.</p>

<ErrorAlert message={error} />

{#if !error && !entries.collections}
	<PageSpinner />
{:else if !entries.active}
	<p class="text-base-content/60 py-8 text-center">
		Les liens sont propres à chaque collection. <a class="link link-primary" href="/collections">Créez d'abord une collection</a>.
	</p>
{:else if entries.collections}
	{#if fromSettings}
		<label class="text-base-content/70 mb-4 flex items-center gap-2 text-sm">
			Collection
			<select class="select select-sm w-auto" value={entries.active.id} onchange={(e) => selectCollection(e.currentTarget.value)}>
				{#each entries.shownCollections ?? [] as collection (collection.id)}
					<option value={collection.id}>{collection.name}</option>
				{/each}
			</select>
		</label>
	{/if}
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body">
			{#key entries.active.id}
				<SiteManager collection={entries.active} />
			{/key}
		</div>
	</section>
{/if}
