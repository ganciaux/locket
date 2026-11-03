<script lang="ts">
	// Index de la collection active : toutes les fiches par ordre alphabétique, en texte, groupées par initiale.
	// Pays, âge, tags et liens affichés à la demande (préférences de l'appareil) ; recherche sur le nom seulement.
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LinkChips from '$lib/components/LinkChips.svelte';
	import { rememberEntryNav, restoreEntryNavScroll } from '$lib/entries/entryNav.svelte';
	import { countryFlag, countryName, formatAge, groupByInitial, matchesSearch } from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { prefs } from '$lib/prefs.svelte';

	const OPTIONS = [
		{ key: 'indexCountry', label: 'Pays' },
		{ key: 'indexAge', label: 'Âge' },
		{ key: 'indexTags', label: 'Tags' },
		{ key: 'indexLinks', label: 'Liens' }
	] as const;

	let error = $state('');
	let query = $state('');
	let searchInput = $state<HTMLInputElement>();

	loadEntries().catch((e) => (error = errorMessage(e)));

	// Cachées selon la préférence, comme sur la liste ; corbeille exclue par `activeItems`, déjà trié par nom.
	const visible = $derived((entries.activeItems ?? []).filter((item) => prefs.showHidden || !item.hidden));
	const results = $derived(query.trim() ? visible.filter((item) => matchesSearch(item.name, query)) : visible);
	const groups = $derived(groupByInitial(results));

	// La fiche ouverte navigue dans l'index affiché, recherche comprise.
	beforeNavigate(({ to }) => {
		if (to?.route.id?.startsWith('/entry/[id]')) rememberEntryNav(results.map((item) => item.id), '/list', 'Index');
	});
	afterNavigate(({ from }) => {
		if (from?.route.id?.startsWith('/entry/[id]')) restoreEntryNavScroll('/list');
	});
</script>

{#if entries.active}
	<CollectionHeader>
		{#snippet actions()}
			<!-- Libellés masqués sur téléphone : avec « Mes fiches », l'en-tête ne tiendrait plus à 320 px. -->
			<a class="btn btn-ghost btn-sm shrink-0" href="/list/compare" aria-label="Comparer une liste" title="Comparer une liste de noms">
				<Icon name="list" class="size-4" /><span class="hidden sm:inline">Comparer</span>
			</a>
			<a class="btn btn-ghost btn-sm shrink-0" href="/entry/import" aria-label="Importer" title="Importer des fiches">
				<Icon name="import" class="size-4" /><span class="hidden sm:inline">Importer</span>
			</a>
		{/snippet}
	</CollectionHeader>
{:else}
	<h1 class="mb-4 text-2xl font-bold">Index</h1>
{/if}

<ErrorAlert message={error} />

{#if !error && !entries.activeItems}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.activeItems?.length === 0}
	<p class="text-base-content/60 py-8 text-center">Aucune fiche dans cette collection.</p>
{:else if entries.activeItems}
	<label class="input mb-3 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input type="search" placeholder="Rechercher un nom" aria-label="Rechercher un nom" bind:this={searchInput} bind:value={query} />
		{#if query}
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle -mr-1"
				aria-label="Effacer la recherche"
				onclick={() => {
					query = '';
					searchInput?.focus();
				}}
			>
				<Icon name="close" class="size-4" />
			</button>
		{/if}
	</label>

	<div class="mb-3 flex flex-wrap items-center gap-2">
		<span class="text-base-content/60 text-xs">Afficher</span>
		{#each OPTIONS as option (option.key)}
			<button
				type="button"
				class="badge badge-lg cursor-pointer badge-primary {prefs[option.key] ? '' : 'badge-outline border-dashed'}"
				aria-pressed={prefs[option.key]}
				onclick={() => (prefs[option.key] = !prefs[option.key])}
			>
				{option.label}
			</button>
		{/each}
		<span class="text-base-content/60 ml-auto text-xs" role="status">
			{results.length} fiche{results.length > 1 ? 's' : ''}{results.length < visible.length ? ` sur ${visible.length}` : ''}
		</span>
	</div>

	{#if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">{query ? 'Aucun nom ne correspond.' : 'Toutes les fiches sont cachées.'}</p>
	{/if}

	{#each groups as group (group.initial)}
		<section class="mb-4" aria-labelledby="initial-{group.initial}">
			<h2 id="initial-{group.initial}" class="text-primary border-base-300 mb-1 border-b pb-1 text-lg font-bold">{group.initial}</h2>
			<ul class="divide-base-200 divide-y">
				{#each group.items as item (item.id)}
					{@const tags = prefs.indexTags ? entries.tagsOf(item) : []}
					{@const links = prefs.indexLinks ? entries.linksOf(item) : []}
					<li class="flex flex-col gap-1.5 py-2 {item.hidden ? 'opacity-50' : ''}">
						<div class="flex items-center gap-2">
							{#if prefs.indexCountry && item.country}
								<span class="shrink-0" title={countryName(item.country)}>{countryFlag(item.country)}</span>
							{/if}
							<a class="link-hover min-w-0 flex-1 truncate font-medium" href="/entry/{item.id}">{item.name}</a>
							{#if prefs.indexCountry && item.country}
								<span class="text-base-content/50 hidden shrink-0 text-xs sm:inline">{countryName(item.country)}</span>
							{/if}
							{#if prefs.indexAge && item.birthYear}
								<span class="text-base-content/60 shrink-0 text-xs" title="Année de naissance : {item.birthYear}">{formatAge(item.birthYear)}</span>
							{/if}
						</div>
						{#if tags.length}
							<div class="flex flex-wrap gap-1">
								{#each tags as tag (tag.id)}
									<span class="badge badge-soft badge-primary badge-xs">{tag.name}</span>
								{/each}
							</div>
						{/if}
						{#if links.length}
							<LinkChips {links} small />
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}
