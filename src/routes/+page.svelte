<script lang="ts">
	// Recherche (« Mes fiches ») : la vitrine de la collection. Cartes, filtres, carte agrandie, tirage au dé ;
	// aucune action de modification (création, sélection, ouverture : depuis l'index).
	import { session } from '$lib/auth/session.svelte';
	import { lastBackupAt } from '$lib/backup/lastBackup';
	import { daysSince, isReminderDue, readBackupInfo, snoozeReminder } from '$lib/backup/reminder';
	import CardSizePicker from '$lib/components/CardSizePicker.svelte';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import EntryCard from '$lib/components/EntryCard.svelte';
	import EntryZoom from '$lib/components/EntryZoom.svelte';
	import FacetDropdown from '$lib/components/FacetDropdown.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import TagFilterChips from '$lib/components/TagFilterChips.svelte';
	import { CARD_GRID } from '$lib/components/cardGrid';
	import { listView } from '$lib/entries/listView.svelte';
	import {
		MAX_LABEL_LENGTH,
		NO_COUNTRY,
		NO_TAG_FILTER,
		type SortOrder,
		RATING_CHOICES,
		VALIDATED_CHOICES,
		type ValidatedFilter,
		countryChoices,
		countryName,
		describeFilter,
		hasAdvancedFilter,
		pickRandom
	} from '$lib/entries/model';
	import { addCollection } from '$lib/entries/collections';
	import {
		deleteUnreadableEntries,
		entries,
		loadEntries,
		reshuffle
	} from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';
	import { prefs } from '$lib/prefs.svelte';

	// Libellés courts : la barre d'affichage doit tenir sur une ligne à 320 px.
	const SORTS: { value: SortOrder; label: string }[] = [
		{ value: 'name', label: 'Tri : nom' },
		{ value: 'created', label: 'Tri : récentes' },
		{ value: 'updated', label: 'Tri : modifiées' },
		{ value: 'rating', label: 'Tri : note' },
		{ value: 'rank', label: 'Tri : classement' },
		{ value: 'random', label: 'Tri : aléatoire' }
	];
	// Filtres et tri : gardés pendant la session, valeurs par défaut à chaque déverrouillage (voir listView).
	const tagFilter = $derived(listView.tags);
	const CARD_DETAILS = [
		{ key: 'cardTags', label: 'Tags', icon: 'tag' },
		{ key: 'cardLinks', label: 'Liens', icon: 'link' }
	] as const;
	// Fiche agrandie, avec les résultats du moment : noter une fiche ne doit pas changer la suite si le filtre l'exclut.
	// `draw` : tirage au hasard (dé), qui joue la révélation de la carte et propose d'en refaire un.
	let zoom = $state<{ id: string; ids: string[]; draw?: number } | null>(null);
	const openZoom = (id: string) => (zoom = { id, ids: results.map((item) => item.id) });
	let lastPicked: string | undefined;
	/** Fiche au hasard parmi les résultats du moment, agrandie et révélée. */
	function openRandom() {
		const id = pickRandom(
			results.map((item) => item.id),
			lastPicked
		);
		if (!id) return;
		lastPicked = id;
		zoom = { id, ids: results.map((item) => item.id), draw: (zoom?.draw ?? 0) + 1 };
	}
	let error = $state('');
	let searchInput = $state<HTMLInputElement>();
	// Date partagée entre appareils (lue sur Firestore) : le bandeau attend de la connaître pour ne pas clignoter.
	let backupInfo = $state(readBackupInfo());
	let remindBackup = $state(false);
	lastBackupAt().then((lastAt) => {
		backupInfo = { ...readBackupInfo(), lastAt };
		remindBackup = isReminderDue(backupInfo, Date.now());
	});

	function remindLater() {
		snoozeReminder();
		remindBackup = false;
	}

	loadEntries().catch((e) => (error = errorMessage(e)));

	const anyLinks = $derived((entries.activeItems ?? []).some((item) => entries.linksOf(item).length > 0));
	const anyRated = $derived((entries.activeItems ?? []).some((item) => item.rating));
	const anyValidated = $derived((entries.activeItems ?? []).some((item) => item.validatedAt));
	const results = $derived(
		entries.search(listView.query, {
			tags: listView.tags,
			// Sans aucune fiche avec liens dans la collection, le filtre par défaut viderait la liste : ignoré.
			withLinks: listView.withLinks && anyLinks,
			rating: listView.rating,
			country: listView.country,
			validated: listView.validated,
			order: listView.sort
		})
	);
	const hiddenCount = $derived((entries.activeItems ?? []).filter((item) => item.hidden).length);

	// Pays présents dans la collection, avec leur nombre de fiches, par nom.
	const countries = $derived(countryChoices(entries.activeItems ?? []));

	let confirmPurge = $state(false);
	let purgePassword = $state('');
	const purge = formAction(async () => {
		await deleteUnreadableEntries(purgePassword);
		purgePassword = '';
		confirmPurge = false;
	});

	const tagFiltering = $derived(tagFilter.untagged || tagFilter.tagIds.length > 0 || tagFilter.missing.length > 0);
	const filterActive = $derived(
		tagFiltering ||
			(listView.withLinks && anyLinks) ||
			listView.rating !== 0 ||
			listView.country.length > 0 ||
			listView.validated !== ''
	);
	const filtering = $derived(!!listView.query.trim() || filterActive);
	// Filtre actif en clair : avec les catégories, OU et ET ne se devinent pas toujours.
	const filterSummary = $derived(
		describeFilter({
			withLinks: listView.withLinks && anyLinks,
			validated: VALIDATED_CHOICES.find((option) => option.value === listView.validated)?.label,
			rating: RATING_CHOICES.find((rating) => rating.value === String(listView.rating))?.label,
			countries: listView.country.map((code) => (code === NO_COUNTRY ? 'Sans pays' : countryName(code))),
			tags: tagFilter,
			tagList: entries.tags ?? [],
			groups: entries.tagGroups
		})
	);

	// Tags et pays sont propres à chaque collection : leur filtre ne survit pas au changement.
	function resetCollectionFilters() {
		listView.tags = { ...NO_TAG_FILTER };
		listView.country = [];
	}

	/** « Effacer » : tout afficher (les valeurs par défaut reviennent au prochain déverrouillage). */
	function clearFilters() {
		resetCollectionFilters();
		listView.withLinks = false;
		listView.rating = 0;
		listView.validated = '';
	}

	let collectionName = $state('');
	const firstCollection = formAction(async () => {
		await addCollection(collectionName);
		collectionName = '';
	});
</script>

<div class="mb-4 flex items-center gap-2">
	{#if entries.active}
		<CollectionSwitcher onselect={resetCollectionFilters} />
	{:else}
		<h1 class="text-2xl font-bold">Mes fiches</h1>
	{/if}
</div>

<ErrorAlert message={error} />

{#if session.recoveryDamaged}
	<p role="alert" class="alert alert-warning alert-soft mb-3 text-sm">
		<span>
			Votre clé de récupération ne correspond plus à ce compte, ses données ont peut-être été modifiées.
			<a class="link" href="/settings">Générez-en une nouvelle</a> et changez votre mot de passe.
		</span>
	</p>
{/if}

{#if entries.catalogDamaged}
	<p role="alert" class="alert alert-warning alert-soft mb-3 text-sm">
		<span>
			La liste des tags ou des collections est endommagée. Vos fiches sont intactes, mais des noms peuvent manquer.
			<a class="link" href="/backup">Restaurez une sauvegarde</a> si vous en avez une récente.
		</span>
	</p>
{/if}

{#if entries.unreadableCount}
	{@const count = entries.unreadableCount}
	<form role="alert" class="alert alert-warning alert-soft mb-3 flex flex-wrap items-center" onsubmit={purge.submit}>
		<span class="flex-1 text-sm">
			{count} fiche{count > 1 ? 's' : ''} illisible{count > 1 ? 's' : ''} : données endommagées. Restaurez une sauvegarde
			saine, ou supprimez-{count > 1 ? 'les' : 'la'}.
		</span>
		{#if confirmPurge}
			<input
				class="input input-sm w-full sm:w-auto"
				type="password"
				autocomplete="current-password"
				placeholder="Mot de passe"
				aria-label="Mot de passe"
				bind:value={purgePassword}
				required
			/>
			<button class="btn btn-error btn-sm" disabled={purge.busy}>Supprimer définitivement</button>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmPurge = false)}>Annuler</button>
		{:else}
			<a class="btn btn-outline btn-primary btn-sm" href="/backup">Restaurer</a>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmPurge = true)}>Supprimer</button>
		{/if}
		<ErrorAlert message={purge.error} />
	</form>
{/if}

{#if !error && !entries.collections}
	<PageSpinner />
{:else if entries.collections?.length === 0}
	<form class="card bg-base-100 mx-auto max-w-md shadow-sm" onsubmit={firstCollection.submit}>
		<div class="card-body gap-4">
			<h2 class="card-title">Créez votre première collection</h2>
			<p class="text-base-content/70 text-sm">
				Chaque fiche appartient à une collection (Manga, Chanteurs, Sportifs…), avec ses propres tags. Vous
				passerez de l'une à l'autre depuis le titre de la liste.
			</p>
			<div class="join w-full">
				<input
					class="input join-item w-full"
					placeholder="Nom de la collection"
					aria-label="Nom de la collection"
					maxlength={MAX_LABEL_LENGTH}
					bind:value={collectionName}
					required
				/>
				<button class="btn btn-primary join-item" disabled={firstCollection.busy}>Créer</button>
			</div>
			<ErrorAlert message={firstCollection.error} />
		</div>
	</form>
{:else if entries.activeItems?.length === 0}
	<div class="flex flex-col items-center gap-4 py-16 text-center">
		<Icon name="image" class="text-base-content/30 size-16" />
		<p class="text-base-content/70">Aucune fiche dans « {entries.active?.name} » pour l'instant.</p>
		<!-- Création dans l'index (le back-office), pas dans la vitrine. -->
		<a class="btn btn-primary" href="/list"><Icon name="list" /> Créer des fiches depuis l'index</a>
	</div>
{:else if entries.activeItems}
	{#if remindBackup}
		<!-- flex-wrap : sur mobile, les boutons passent sous le texte au lieu de déborder de l'écran. -->
		<div role="status" class="alert alert-warning alert-soft mb-3 flex flex-wrap items-center">
			<span class="text-sm">
				{backupInfo.lastAt
					? `Dernière sauvegarde il y a ${daysSince(backupInfo.lastAt, Date.now())} jours.`
					: 'Aucune sauvegarde enregistrée.'}
			</span>
			<div class="ml-auto flex gap-2">
				<button class="btn btn-ghost btn-sm" onclick={remindLater}>Plus tard</button>
				<a class="btn btn-outline btn-primary btn-sm" href="/backup">Sauvegarder</a>
			</div>
		</div>
	{/if}
	<label class="input mb-3 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input
			type="search"
			placeholder="Rechercher dans {entries.active?.name}"
			aria-label="Rechercher"
			bind:this={searchInput}
			bind:value={listView.query}
		/>
		{#if listView.query}
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle -mr-1"
				aria-label="Effacer la recherche"
				onclick={() => {
					listView.query = '';
					searchInput?.focus();
				}}
			>
				<Icon name="close" class="size-4" />
			</button>
		{/if}
	</label>

	<!--
		Filtres : liens, note et pays sur une ligne, puis les tags (OU dans une catégorie, ET entre catégories).
		Valeurs par défaut à chaque déverrouillage : avec liens, toutes les notes, tous les pays, aucun tag.
	-->
	{#if entries.tags?.length || anyLinks || anyRated || countries.length || anyValidated}
		<div class="mb-3 flex flex-col gap-2">
			<div class="flex min-h-6 items-center gap-2">
				<span class="text-base-content/60 text-xs">Filtrer</span>
				{#if entries.tags?.length && hasAdvancedFilter(entries.tags, entries.tagGroups)}
					<button
						class="btn btn-xs {listView.extended ? 'btn-primary' : 'btn-ghost'}"
						aria-pressed={listView.extended}
						title={listView.extended ? 'Seulement les catégories et tags principaux' : 'Proposer aussi les autres catégories et tags'}
						onclick={() => (listView.extended = !listView.extended)}
					>
						Recherche avancée
					</button>
				{/if}
				{#if filterActive}
					<button class="btn btn-ghost btn-xs ml-auto" onclick={clearFilters}>Effacer</button>
				{/if}
			</div>
			{#if anyLinks || anyRated || countries.length || anyValidated}
				<div class="flex flex-wrap items-center gap-2">
					{#if anyLinks}
						<button
							type="button"
							class="badge badge-lg cursor-pointer gap-1 badge-primary {listView.withLinks ? '' : 'badge-outline border-dashed'}"
							aria-pressed={listView.withLinks}
							title={listView.withLinks ? 'Afficher aussi les fiches sans lien' : 'Seulement les fiches avec liens'}
							onclick={() => (listView.withLinks = !listView.withLinks)}
						>
							<Icon name="link" class="size-3" /> Avec liens
						</button>
					{/if}
					{#if anyRated}
						<!-- Un seul choix : les seuils « et plus » s'incluent l'un l'autre. -->
						<FacetDropdown
							name="Note"
							single
							options={RATING_CHOICES}
							selected={listView.rating ? [String(listView.rating)] : []}
							onchange={(next) => (listView.rating = Number(next[0] ?? 0))}
						/>
					{/if}
					{#if anyValidated}
						<FacetDropdown
							name="Statut"
							single
							options={VALIDATED_CHOICES}
							selected={listView.validated ? [listView.validated] : []}
							onchange={(next) => (listView.validated = (next[0] ?? '') as ValidatedFilter)}
						/>
					{/if}
					{#if countries.length}
						<!-- Plusieurs pays, en OU : même pastille à cocher que les catégories de tags. -->
						<FacetDropdown
							name="Pays"
							options={countries}
							selected={listView.country}
							onchange={(next) => (listView.country = next)}
						/>
					{/if}
				</div>
			{/if}
			<TagFilterChips bind:filter={listView.tags} extended={listView.extended} />
			{#if filterSummary.length}
				<p class="text-base-content/60 text-xs">{filterSummary.join(' et ')}</p>
			{/if}
		</div>
	{/if}

	<!--
		Affichage, sur deux lignes pour tenir à 320 px : le compteur et le tri, puis les bascules d'affichage
		et la taille des cartes.
	-->
	<div class="mb-3 flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<span class="text-base-content/60 min-w-0 truncate text-xs" role="status">
				{results.length} fiche{results.length > 1 ? 's' : ''}{filtering || results.length < entries.activeItems.length
					? ` sur ${entries.activeItems.length}`
					: ''}
			</span>
			<select class="select select-xs ml-auto w-auto" aria-label="Trier par" bind:value={listView.sort}>
				{#each SORTS as sort (sort.value)}
					<option value={sort.value}>{sort.label}</option>
				{/each}
			</select>
			{#if results.length > 1}
				<button
					class="btn btn-ghost btn-xs btn-square"
					onclick={openRandom}
					aria-label="Une fiche au hasard"
					title="Une fiche au hasard parmi celles affichées"
				>
					<Icon name="dice" class="size-4" />
				</button>
			{/if}
			{#if listView.sort === 'random'}
				<button class="btn btn-ghost btn-xs btn-square" onclick={reshuffle} aria-label="Remélanger" title="Remélanger">
					<Icon name="shuffle" class="size-4" />
				</button>
			{/if}
			{#if listView.sort === 'rank' && entries.active}
				{@const unranked = entries.unranked(entries.active.id).length}
				<a class="btn btn-ghost btn-xs" href="/ranking/duel" title="Classer les fiches par duels">
					<Icon name="podium" class="size-4" /> Classer{unranked ? ` (${unranked})` : ''}
				</a>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if hiddenCount}
				<button
					class="btn btn-xs {prefs.showHidden ? 'btn-primary' : 'btn-ghost'}"
					aria-pressed={prefs.showHidden}
					title={prefs.showHidden ? 'Masquer les cachées' : 'Afficher les cachées'}
					onclick={() => (prefs.showHidden = !prefs.showHidden)}
				>
					Cachées ({hiddenCount})
				</button>
			{/if}
			<!-- Chacun à part : aucun, tags, liens ou les deux sur toutes les cartes (préférence retenue). -->
			{#each CARD_DETAILS as detail (detail.key)}
				<button
					class="btn btn-xs {prefs[detail.key] ? 'btn-primary' : 'btn-ghost'}"
					aria-pressed={prefs[detail.key]}
					aria-label="{detail.label} sur les cartes"
					title="{prefs[detail.key] ? 'Masquer' : 'Afficher'} les {detail.label.toLowerCase()} sur toutes les cartes"
					onclick={() => (prefs[detail.key] = !prefs[detail.key])}
				>
					<Icon name={detail.icon} class="size-3" />
					{detail.label}
				</button>
			{/each}
			<CardSizePicker />
		</div>
	</div>

	{#if results.length === 0 && filtering}
		<p class="text-base-content/60 py-8 text-center">Aucune fiche ne correspond.</p>
	{:else if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">Toutes les fiches sont cachées.</p>
	{/if}

	<!-- items-start : une carte détaillée s'allonge sans étirer ses voisines. -->
	<ul class="grid {CARD_GRID[prefs.cardSize]}">
		{#each results as entry (entry.id)}
			<EntryCard {entry} onzoom={() => openZoom(entry.id)} />
		{/each}
	</ul>
{/if}

{#if zoom}
	<EntryZoom
		id={zoom.id}
		ids={zoom.ids}
		draw={zoom.draw}
		onchange={(id) => zoom && (zoom.id = id)}
		onclose={() => (zoom = null)}
		onreroll={zoom.draw ? openRandom : undefined}
	/>
{/if}
