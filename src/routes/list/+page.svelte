<script lang="ts">
	// Index de la collection active, le back-office : toutes les fiches par ordre alphabétique, en liste groupée par
	// initiale ou en cartes ; création, sélection multiple et actions groupées, ouverture et modification des fiches.
	// Pays, âge, tags et liens affichés à la demande (préférences de l'appareil) ; recherche sur le nom seulement.
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import BulkToolbar from '$lib/components/BulkToolbar.svelte';
	import CardSizePicker from '$lib/components/CardSizePicker.svelte';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import EntryCard from '$lib/components/EntryCard.svelte';
	import NewEntryButton from '$lib/components/NewEntryButton.svelte';
	import TagFilterChips from '$lib/components/TagFilterChips.svelte';
	import { CARD_GRID } from '$lib/components/cardGrid';
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
		countryChoices,
		countryFlag,
		countryName,
		formatAge,
		framingClass,
		groupByInitial,
		groupTags,
		hasAdvancedFilter,
		matchesSearch,
		NO_TAG_FILTER,
		missingFields,
		missingLabel,
		notValidated,
		matchesValidatedFilter,
		RATING_CHOICES,
		tagQueue,
		VALIDATED_CHOICES,
		type ValidatedFilter
	} from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { startTagging } from '$lib/entries/tagging.svelte';
	import { errorMessage } from '$lib/errors';
	import { INDEX_THUMBS, prefs } from '$lib/prefs.svelte';

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
	// Pays présents dans la collection, avec leur nombre de fiches ; note proposée dès qu'une fiche en a une.
	const countries = $derived(countryChoices(entries.activeItems ?? []));
	const anyRated = $derived(visible.some((item) => item.rating));
	const anyGallery = $derived(visible.some((item) => item.gallery?.length));
	// Tags, note et pays : mêmes filtres que la recherche (`entries.search`, cachées selon la préférence, par nom),
	// à part des siens.
	const results = $derived(
		entries
			.search('', { tags: listView.indexTags, rating: listView.indexRating, country: listView.indexCountries })
			.filter(
				(item) =>
					(!query.trim() || matchesSearch(item.name, query)) &&
					incomplete(item) &&
					(!listView.indexMultiImages || !!item.gallery?.length) &&
					matchesValidatedFilter(item.validatedAt, listView.indexValidated)
			)
	);
	const tagFiltering = $derived(
		listView.indexTags.untagged || listView.indexTags.tagIds.length > 0 || listView.indexTags.missing.length > 0
	);
	const filterActive = $derived(
		tagFiltering ||
			!!listView.indexMissing ||
			!!listView.indexValidated ||
			listView.indexRating !== 0 ||
			listView.indexCountries.length > 0 ||
			listView.indexMultiImages
	);

	// Tags et pays sont propres à chaque collection : leur filtre ne survit pas au changement.
	function resetCollectionFilters() {
		listView.indexTags = { ...NO_TAG_FILTER };
		listView.indexCountries = [];
	}

	/** « Effacer » : tous les filtres ; la recherche par nom a sa propre croix. */
	function clearFilters() {
		resetCollectionFilters();
		listView.indexMissing = '';
		listView.indexValidated = '';
		listView.indexRating = 0;
		listView.indexMultiImages = false;
	}

	/** Miniature : aucune → petite → grande → aucune. */
	function nextThumb() {
		const at = INDEX_THUMBS.findIndex((thumb) => thumb.value === prefs.indexThumb);
		prefs.indexThumb = INDEX_THUMBS[(at + 1) % INDEX_THUMBS.length].value;
	}
	const thumbLabel = $derived(INDEX_THUMBS.find((thumb) => thumb.value === prefs.indexThumb)?.label);

	// Sélection multiple : les actions et leur état vivent dans BulkToolbar, fermée en quittant.
	let selecting = $state(false);
	let selected = $state<string[]>([]);

	function stopSelecting() {
		selecting = false;
		selected = [];
	}

	function toggleSelected(id: string) {
		selected = selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id];
	}

	/** En sélection, le nom et la miniature cochent la fiche au lieu de l'ouvrir. */
	function pickInstead(event: MouseEvent, id: string) {
		if (!selecting) return;
		event.preventDefault();
		toggleSelected(id);
	}
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
	<CollectionHeader onselect={resetCollectionFilters}>
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

	<!-- Filtres : « Il manque », statut, note, pays et tags (catégories avancées sur demande), pour sélectionner par lot. -->
	<div class="mb-3 flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-base-content/60 text-xs">Filtrer</span>
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
			{#if anyRated}
				<FacetDropdown
					name="Note"
					single
					options={RATING_CHOICES}
					selected={listView.indexRating ? [String(listView.indexRating)] : []}
					onchange={(next) => (listView.indexRating = Number(next[0] ?? 0))}
				/>
			{/if}
			{#if anyGallery}
				<button
					type="button"
					class="badge badge-lg cursor-pointer gap-1 badge-primary {listView.indexMultiImages ? '' : 'badge-outline border-dashed'}"
					aria-pressed={listView.indexMultiImages}
					title={listView.indexMultiImages ? 'Toutes les fiches' : "Seulement les fiches avec d'autres images que la couverture"}
					onclick={() => (listView.indexMultiImages = !listView.indexMultiImages)}
				>
					<Icon name="images" class="size-3" /> Plusieurs images
				</button>
			{/if}
			{#if countries.length}
				<FacetDropdown
					name="Pays"
					options={countries}
					selected={listView.indexCountries}
					onchange={(next) => (listView.indexCountries = next)}
				/>
			{/if}
			{#if entries.tags?.length && hasAdvancedFilter(entries.tags, entries.tagGroups)}
				<button
					class="btn btn-xs {listView.indexExtended ? 'btn-primary' : 'btn-ghost'}"
					aria-pressed={listView.indexExtended}
					title={listView.indexExtended ? 'Seulement les catégories et tags principaux' : 'Proposer aussi les autres catégories et tags'}
					onclick={() => (listView.indexExtended = !listView.indexExtended)}
				>
					Recherche avancée
				</button>
			{/if}
			{#if filterActive}
				<button class="btn btn-ghost btn-xs ml-auto" onclick={clearFilters}>Effacer</button>
			{/if}
		</div>
		<TagFilterChips bind:filter={listView.indexTags} extended={listView.indexExtended} />
	</div>

	<!-- Présentation : liste de noms ou cartes (préférence de l'appareil), et sélection multiple. -->
	<div class="mb-3 flex items-center gap-2">
		<span class="text-base-content/60 min-w-0 truncate text-xs" role="status">
			{results.length} fiche{results.length > 1 ? 's' : ''}{results.length < visible.length ? ` sur ${visible.length}` : ''}
		</span>
		<div class="join ml-auto" role="radiogroup" aria-label="Présentation">
			<input class="join-item btn btn-xs" type="radio" name="index-view" value={false} aria-label="Liste" bind:group={prefs.indexCards} />
			<input class="join-item btn btn-xs" type="radio" name="index-view" value={true} aria-label="Cartes" bind:group={prefs.indexCards} />
		</div>
		<button
			class="btn btn-xs {selecting ? 'btn-primary' : 'btn-ghost'}"
			aria-pressed={selecting}
			title="Sélectionner plusieurs fiches"
			onclick={() => (selecting ? stopSelecting() : (selecting = true))}
		>
			<Icon name="check" class="size-3" /> Sélection
		</button>
	</div>

	{#if prefs.indexCards}
		<div class="mb-3 flex items-center gap-2">
			<CardSizePicker />
		</div>
	{:else}
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<span class="text-base-content/60 text-xs">Afficher</span>
			{#each OPTIONS as option (option.key)}
				{#if option.key === 'indexThumb'}
					<!-- Trois états : pointillés (aucune), trait plein (petite), plein (grande, comme une petite carte). -->
					<button
						type="button"
						class="badge badge-lg cursor-pointer badge-primary {prefs.indexThumb === 'large'
							? ''
							: prefs.indexThumb === 'small'
								? 'badge-outline'
								: 'badge-outline border-dashed'}"
						aria-pressed={prefs.indexThumb !== 'off'}
						aria-label="Miniature : {thumbLabel}"
						title="Miniature : {thumbLabel} (aucune, petite, grande)"
						onclick={nextThumb}
					>
						{option.label}
					</button>
				{:else}
					<button
						type="button"
						class="badge badge-lg cursor-pointer badge-primary {prefs[option.key] ? '' : 'badge-outline border-dashed'}"
						aria-pressed={prefs[option.key]}
						title={'title' in option ? option.title : undefined}
						onclick={() => (prefs[option.key] = !prefs[option.key])}
					>
						{option.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	{#if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">
			{query
				? 'Aucun nom ne correspond.'
				: tagFiltering
					? 'Aucune fiche avec ces tags.'
					: listView.indexMissing
						? 'Aucune fiche à compléter.'
						: listView.indexValidated
							? 'Aucune fiche avec ce statut.'
							: filterActive
								? 'Aucune fiche ne correspond aux filtres.'
								: 'Toutes les fiches sont cachées.'}
		</p>
	{/if}

	{#if prefs.indexCards}
		<!-- Cartes compactes (ni tags ni liens) : un clic ouvre la fiche, ou la coche en sélection. -->
		<ul class="grid {CARD_GRID[prefs.cardSize]}">
			{#each results as entry (entry.id)}
				<EntryCard {entry} details={false} {selecting} selected={selected.includes(entry.id)} ontoggle={() => toggleSelected(entry.id)} />
			{/each}
		</ul>
	{:else}
		{#each groups as group (group.initial)}
			<section class="mb-4" aria-labelledby={group.initial ? `initial-${group.initial}` : undefined}>
				{#if group.initial}
					<h2 id="initial-{group.initial}" class="text-primary border-base-300 mb-1 border-b pb-1 text-lg font-bold">{group.initial}</h2>
				{/if}
				<ul class="divide-base-200 divide-y">
					{#each group.items as item (item.id)}
						{@const tags = prefs.indexTags ? entries.tagsOf(item) : []}
						{@const links = prefs.indexLinks ? entries.linksOf(item) : []}
						{@const picked = selecting && selected.includes(item.id)}
						<li class="flex flex-col gap-1.5 py-2 {item.hidden ? 'opacity-50' : ''} {picked ? 'bg-primary/10' : ''}">
							<div class="flex items-center gap-2">
								{#if selecting}
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary shrink-0"
										checked={picked}
										onchange={() => toggleSelected(item.id)}
										aria-label="Sélectionner {item.name}"
									/>
								{/if}
								{#if prefs.indexRank}
									{@const rank = entries.rankOf(item)}
									<!-- Largeur fixe : les noms restent alignés, classés ou non. -->
									<span class="w-9 shrink-0 text-center">
										{#if rank}<span class="badge badge-sm badge-neutral" title="Rang au classement">#{rank}</span>{/if}
									</span>
								{/if}
								{#if prefs.indexThumb !== 'off'}
									{@const large = prefs.indexThumb === 'large'}
									<!--
										Ouvre la fiche comme le nom ; hors de l'ordre de tabulation, le nom suffit au clavier.
										Grande : à la taille d'une petite carte (S), avec le cadre de bordure complet.
									-->
									<a href="/entry/{item.id}" class="shrink-0" tabindex="-1" aria-hidden="true" onclick={(event) => pickInstead(event, item.id)}>
										{#if item.thumbUrl}
											<img
												src={item.thumbUrl}
												alt=""
												loading="lazy"
												decoding="async"
												data-border={entries.borderOf(item)}
												class="rounded-box block object-cover {large ? 'size-24 sm:size-28' : 'frame-thin size-10'} {framingClass(item.framing)}"
											/>
										{:else}
											<span
												data-border={entries.borderOf(item)}
												class="bg-primary/10 text-primary rounded-box flex items-center justify-center font-bold {large
													? 'size-24 text-3xl sm:size-28'
													: 'frame-thin size-10'}"
											>
												{item.name.charAt(0).toUpperCase()}
											</span>
										{/if}
									</a>
								{/if}
								{#if prefs.indexCountry && item.country}
									<span class="shrink-0" title={countryName(item.country)}>{countryFlag(item.country)}</span>
								{/if}
								<!-- Le nom ouvre la fiche ; le crayon, la modification (au survol sur ordinateur, toujours au toucher). -->
								<div class="group flex min-w-0 flex-1 items-center gap-1">
									<a class="link-hover min-w-0 truncate font-medium" href="/entry/{item.id}" onclick={(event) => pickInstead(event, item.id)}>{item.name}</a>
									{#if item.gallery?.length}
										<span class="text-base-content/50 flex shrink-0 items-center gap-0.5 text-xs" role="img" aria-label="{item.gallery.length + 1} images">
											<Icon name="images" class="size-3.5" />{item.gallery.length + 1}
										</span>
									{/if}
									{#if !selecting}
										<a
											class="btn btn-ghost btn-xs btn-square pointer-fine:opacity-0 shrink-0 group-hover:opacity-100 focus-visible:opacity-100"
											href="/entry/{item.id}/edit?from=list"
											aria-label="Modifier {item.name}"
											title="Modifier"
										>
											<Icon name="edit" class="size-3.5" />
										</a>
{/if}
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
{/if}

<!-- Hors des branches : une sélection qui vide l'index (tout à la corbeille) garde sa barre et son « Annuler ». -->
{#if entries.activeItems}
	{#if selecting}
		<BulkToolbar items={results} bind:selected onclose={stopSelecting} />
	{:else}
		<NewEntryButton />
	{/if}
{/if}
