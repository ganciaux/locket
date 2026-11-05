<script lang="ts">
	// Index de la collection active : toutes les fiches par ordre alphabétique, en texte, groupées par initiale.
	// Pays, âge, tags et liens affichés à la demande (préférences de l'appareil) ; recherche sur le nom seulement.
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import FacetDropdown, { type FacetOption } from '$lib/components/FacetDropdown.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ValidatedMark from '$lib/components/ValidatedMark.svelte';
	import LinkChips from '$lib/components/LinkChips.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import { rememberEntryNav, restoreEntryNavScroll } from '$lib/entries/entryNav.svelte';
	import { listView } from '$lib/entries/listView.svelte';
	import {
		type MissingField,
		countryFlag,
		countryName,
		formatAge,
		framingClass,
		groupByInitial,
		groupTags,
		matchesSearch,
		missingFields,
		missingLabel,
		notValidated,
		matchesValidatedFilter,
		tagQueue,
		VALIDATED_CHOICES,
		type ValidatedFilter
	} from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { startTagging } from '$lib/entries/tagging.svelte';
	import { errorMessage } from '$lib/errors';
	import { prefs } from '$lib/prefs.svelte';

	const OPTIONS = [
		{ key: 'indexInitials', label: 'A…Z', title: 'Lettres de séparation' },
		{ key: 'indexThumb', label: 'Miniature' },
		{ key: 'indexRank', label: 'Classement', title: 'Rang au classement' },
		{ key: 'indexCountry', label: 'Pays' },
		{ key: 'indexAge', label: 'Âge' },
		{ key: 'indexStatus', label: 'Validées', title: 'Coche des fiches validées' },
		{ key: 'indexTags', label: 'Tags' },
		{ key: 'indexLinks', label: 'Liens' }
	] as const;

	let error = $state('');
	let query = $state('');
	let searchInput = $state<HTMLInputElement>();

	loadEntries().catch((e) => (error = errorMessage(e)));

	// Cachées selon la préférence, comme sur la liste ; corbeille exclue par `activeItems`, déjà trié par nom.
	const visible = $derived((entries.activeItems ?? []).filter((item) => prefs.showHidden || !item.hidden));
	// « Il manque » : gardé pendant la session, pour compléter les fiches une à une sans le perdre.
	const missingOf = (item: (typeof visible)[number]) => missingFields(item, entries.tags ?? [], entries.tagGroups);
	// Libellés lus avec la pastille : « Il manque : Pays ».
	const missingChoices = $derived<FacetOption[]>([
		{ value: 'any', label: 'Une info' },
		{ value: 'country', label: 'Pays' },
		{ value: 'birthYear', label: 'Naissance' },
		{ value: 'image', label: 'Image' },
		...groupTags(entries.tags ?? [], entries.tagGroups).flatMap(({ group }) =>
			group ? [{ value: `group:${group.id}`, label: group.name }] : []
		)
	]);
	const incomplete = (item: (typeof visible)[number]): boolean => {
		const filter = listView.indexMissing;
		if (!filter) return true;
		const missing = missingOf(item);
		return filter === 'any' ? missing.length > 0 : missing.includes(filter as MissingField);
	};
	const results = $derived(
		visible.filter(
			(item) =>
				(!query.trim() || matchesSearch(item.name, query)) &&
				incomplete(item) &&
				matchesValidatedFilter(item.validatedAt, listView.indexValidated)
		)
	);
	// Sans les lettres de séparation : une seule section, sans titre.
	const groups = $derived(prefs.indexInitials ? groupByInitial(results) : [{ initial: '', items: results }]);

	// La fiche ouverte navigue dans l'index affiché, recherche comprise.
	beforeNavigate(({ to }) => {
		if (to?.route.id?.startsWith('/entry/[id]')) rememberEntryNav(results.map((item) => item.id), '/list', 'Index');
	});
	afterNavigate(({ from }) => {
		if (from?.route.id?.startsWith('/entry/[id]')) restoreEntryNavScroll('/list');
	});

	// Mode Tagger : la file part de l'index affiché (recherche et « Il manque » compris), figée au départ ;
	// les fiches validées n'y entrent pas.
	function startTaggingMode() {
		startTagging(tagQueue(notValidated(results), listView.indexMissing, (item) => entries.tagsOf(item).length));
		goto('/tagging');
	}
</script>

{#if entries.active}
	<CollectionHeader>
		{#snippet actions()}
			<!-- Libellés masqués sur téléphone : avec « Mes fiches », l'en-tête ne tiendrait plus à 320 px. -->
			{#if entries.tags?.length && results.length}
				<button class="btn btn-ghost btn-sm shrink-0" aria-label="Tagger" title="Tagger les fiches une à une" onclick={startTaggingMode}>
					<Icon name="tag" class="size-4" /><span class="hidden sm:inline">Tagger</span>
				</button>
			{/if}
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
	<PageSpinner />
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
				title={'title' in option ? option.title : undefined}
				onclick={() => (prefs[option.key] = !prefs[option.key])}
			>
				{option.label}
			</button>
		{/each}
		<FacetDropdown
			name="Il manque"
			single
			options={missingChoices}
			selected={listView.indexMissing ? [listView.indexMissing] : []}
			onchange={(next) => (listView.indexMissing = next[0] ?? '')}
		/>
		{#if visible.some((item) => item.validatedAt)}
			<FacetDropdown
				name="Statut"
				single
				options={VALIDATED_CHOICES}
				selected={listView.indexValidated ? [listView.indexValidated] : []}
				onchange={(next) => (listView.indexValidated = (next[0] ?? '') as ValidatedFilter)}
			/>
		{/if}
		<span class="text-base-content/60 ml-auto text-xs" role="status">
			{results.length} fiche{results.length > 1 ? 's' : ''}{results.length < visible.length ? ` sur ${visible.length}` : ''}
		</span>
	</div>

	{#if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">
			{query
				? 'Aucun nom ne correspond.'
				: listView.indexMissing
					? 'Aucune fiche à compléter.'
					: listView.indexValidated
						? 'Aucune fiche avec ce statut.'
						: 'Toutes les fiches sont cachées.'}
		</p>
	{/if}

	{#each groups as group (group.initial)}
		<section class="mb-4" aria-labelledby={group.initial ? `initial-${group.initial}` : undefined}>
			{#if group.initial}
				<h2 id="initial-{group.initial}" class="text-primary border-base-300 mb-1 border-b pb-1 text-lg font-bold">{group.initial}</h2>
			{/if}
			<ul class="divide-base-200 divide-y">
				{#each group.items as item (item.id)}
					{@const tags = prefs.indexTags ? entries.tagsOf(item) : []}
					{@const links = prefs.indexLinks ? entries.linksOf(item) : []}
					<li class="flex flex-col gap-1.5 py-2 {item.hidden ? 'opacity-50' : ''}">
						<div class="flex items-center gap-2">
							{#if prefs.indexRank}
								{@const rank = entries.rankOf(item)}
								<!-- Largeur fixe : les noms restent alignés, classés ou non. -->
								<span class="w-9 shrink-0 text-center">
									{#if rank}<span class="badge badge-sm badge-neutral" title="Rang au classement">#{rank}</span>{/if}
								</span>
							{/if}
							{#if prefs.indexThumb}
								{#if item.thumbUrl}
									<img src={item.thumbUrl} alt="" class="rounded-box size-10 shrink-0 object-cover {framingClass(item.framing)}" />
								{:else}
									<span class="bg-primary/10 text-primary rounded-box flex size-10 shrink-0 items-center justify-center font-bold" aria-hidden="true">
										{item.name.charAt(0).toUpperCase()}
									</span>
								{/if}
							{/if}
							{#if prefs.indexCountry && item.country}
								<span class="shrink-0" title={countryName(item.country)}>{countryFlag(item.country)}</span>
							{/if}
							<!-- Le nom ouvre la fiche ; le crayon, la modification (au survol sur ordinateur, toujours au toucher). -->
							<div class="group flex min-w-0 flex-1 items-center gap-1">
								<a class="link-hover min-w-0 truncate font-medium" href="/entry/{item.id}">{item.name}</a>
								<a
									class="btn btn-ghost btn-xs btn-square pointer-fine:opacity-0 shrink-0 group-hover:opacity-100 focus-visible:opacity-100"
									href="/entry/{item.id}/edit?from=list"
									aria-label="Modifier {item.name}"
									title="Modifier"
								>
									<Icon name="edit" class="size-3.5" />
								</a>
							</div>
							{#if prefs.indexCountry && item.country}
								<span class="text-base-content/50 hidden shrink-0 text-xs sm:inline">{countryName(item.country)}</span>
							{/if}
							{#if prefs.indexAge && item.birthYear}
								<span class="text-base-content/60 shrink-0 text-xs" title="Année de naissance : {item.birthYear}">{formatAge(item.birthYear)}</span>
							{/if}
							{#if prefs.indexStatus && item.validatedAt}<ValidatedMark />{/if}
						</div>
						{#if listView.indexMissing}
							{@const missing = missingOf(item)}
							{#if missing.length}
								<span class="text-base-content/60 text-xs italic">
									Manque : {missing.map((field) => missingLabel(field, entries.tagGroups)).join(', ')}
								</span>
							{/if}
						{/if}
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
