<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { session } from '$lib/auth/session.svelte';
	import { lastBackupAt } from '$lib/backup/lastBackup';
	import { daysSince, isReminderDue, readBackupInfo, snoozeReminder } from '$lib/backup/reminder';
	import BulkToolbar from '$lib/components/BulkToolbar.svelte';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import EntryCard from '$lib/components/EntryCard.svelte';
	import EntryZoom from '$lib/components/EntryZoom.svelte';
	import FacetDropdown, { type FacetOption } from '$lib/components/FacetDropdown.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NewEntryButton from '$lib/components/NewEntryButton.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import TagFacets from '$lib/components/TagFacets.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { rememberEntryNav, restoreEntryNavScroll } from '$lib/entries/entryNav.svelte';
	import { listView } from '$lib/entries/listView.svelte';
	import {
		MAX_LABEL_LENGTH,
		NO_COUNTRY,
		NO_TAG_FILTER,
		type SortOrder,
		UNRATED,
		VALIDATED_CHOICES,
		type ValidatedFilter,
		countryFlag,
		countryName,
		describeFilter,
		filterableTags,
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
	import { type CardSize, prefs } from '$lib/prefs.svelte';

	// Classes écrites en entier : Tailwind ne détecte pas les noms de classes construits dynamiquement.
	const GRID: Record<CardSize, string> = {
		small: 'grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6',
		medium: 'grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4',
		large: 'grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3'
	};
	const SIZES: { value: CardSize; label: string; title: string }[] = [
		{ value: 'small', label: 'S', title: 'Petites cartes' },
		{ value: 'medium', label: 'M', title: 'Cartes moyennes' },
		{ value: 'large', label: 'L', title: 'Grandes cartes' }
	];
	// Libellés courts : la barre d'affichage doit tenir sur une ligne à 320 px.
	const SORTS: { value: SortOrder; label: string }[] = [
		{ value: 'name', label: 'Tri : nom' },
		{ value: 'created', label: 'Tri : récentes' },
		{ value: 'updated', label: 'Tri : modifiées' },
		{ value: 'rating', label: 'Tri : note' },
		{ value: 'rank', label: 'Tri : classement' },
		{ value: 'random', label: 'Tri : aléatoire' }
	];
	// Note minimale, en demi-étoiles : 6 = 3 étoiles ; rien de choisi : toutes les notes.
	const RATINGS: FacetOption[] = [
		{ value: '2', label: '★ 1 et plus' },
		{ value: '4', label: '★ 2 et plus' },
		{ value: '6', label: '★ 3 et plus' },
		{ value: '8', label: '★ 4 et plus' },
		{ value: '9', label: '★ 4,5 et plus' },
		{ value: '10', label: '★ 5' },
		{ value: String(UNRATED), label: 'Sans note', extra: true }
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
	/** Fiche au hasard parmi les résultats du moment, ouverte comme un clic sur sa carte (agrandie ou ouverte). */
	function openRandom() {
		const id = pickRandom(
			results.map((item) => item.id),
			lastPicked
		);
		if (!id) return;
		lastPicked = id;
		if (prefs.cardClick === 'open') goto(`/entry/${id}?tirage`);
		else zoom = { id, ids: results.map((item) => item.id), draw: (zoom?.draw ?? 0) + 1 };
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

	// La fiche ouverte navigue dans ces résultats, filtres et tri compris.
	beforeNavigate(({ to }) => {
		if (to?.route.id?.startsWith('/entry/[id]')) rememberEntryNav(results.map((item) => item.id), '/', 'Mes fiches');
	});
	afterNavigate(({ from }) => {
		if (from?.route.id?.startsWith('/entry/[id]')) restoreEntryNavScroll('/');
	});

	// Pays présents dans la collection, avec leur nombre de fiches, par nom.
	const countries = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const item of entries.activeItems ?? [])
			if (item.country) counts.set(item.country, (counts.get(item.country) ?? 0) + 1);
		return [...counts]
			.map(([code, count]) => ({ code, count, name: countryName(code) }))
			.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
	});

	let confirmPurge = $state(false);
	let purgePassword = $state('');
	const purge = formAction(async () => {
		await deleteUnreadableEntries(purgePassword);
		purgePassword = '';
		confirmPurge = false;
	});

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
			rating: RATINGS.find((rating) => rating.value === String(listView.rating))?.label,
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

	// « Sans tag » et les tags sélectionnés s'excluent : cocher l'un décoche l'autre.
	function toggleUntagged() {
		listView.tags.untagged = !listView.tags.untagged;
		if (listView.tags.untagged) {
			listView.tags.tagIds = [];
			listView.tags.missing = [];
		}
	}
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
		<a class="btn btn-primary" href="/entry/new"><Icon name="plus" /> Créer une fiche</a>
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
							options={RATINGS}
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
							options={[
								...countries.map((country) => ({
									value: country.code,
									label: `${countryFlag(country.code)} ${country.name} (${country.count})`
								})),
								{ value: NO_COUNTRY, label: 'Sans pays', extra: true }
							]}
							selected={listView.country}
							onchange={(next) => (listView.country = next)}
						/>
					{/if}
				</div>
			{/if}
			<!-- Avec des catégories : une pastille par catégorie (facettes) ; sinon tous les tags à plat. -->
			{#snippet untaggedChip()}
				<button
					type="button"
					class="badge badge-lg cursor-pointer italic badge-primary {tagFilter.untagged ? '' : 'badge-outline border-dashed'}"
					aria-pressed={tagFilter.untagged}
					onclick={toggleUntagged}
				>
					Sans tag
				</button>
			{/snippet}
			{#if entries.tags?.length && entries.tagGroups.length}
				<TagFacets
					tags={entries.tags}
					groups={entries.tagGroups}
					bind:selected={listView.tags.tagIds}
					bind:missing={listView.tags.missing}
					extended={listView.extended}
					onchange={() => (listView.tags.tagIds.length || listView.tags.missing.length) && (listView.tags.untagged = false)}
					before={untaggedChip}
				/>
			{:else if entries.tags?.length}
				<TagPicker
					tags={filterableTags(entries.tags, listView.extended, listView.tags.tagIds)}
					bind:selected={listView.tags.tagIds}
					label="Filtrer par tags"
					onchange={(selected) => selected.length && (listView.tags.untagged = false)}
					before={untaggedChip}
				/>
			{/if}
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
			<button
				class="btn btn-xs {selecting ? 'btn-primary' : 'btn-ghost'}"
				aria-pressed={selecting}
				title="Sélectionner plusieurs fiches"
				onclick={() => (selecting ? stopSelecting() : (selecting = true))}
			>
				<Icon name="check" class="size-3" /> Sélection
			</button>
			<div class="join ml-auto" role="radiogroup" aria-label="Taille des cartes">
				{#each SIZES as size (size.value)}
					<input
						class="join-item btn btn-xs"
						type="radio"
						name="card-size"
						value={size.value}
						aria-label={size.label}
						title={size.title}
						bind:group={prefs.cardSize}
					/>
				{/each}
			</div>
		</div>
	</div>

	{#if results.length === 0 && filtering}
		<p class="text-base-content/60 py-8 text-center">Aucune fiche ne correspond.</p>
	{:else if results.length === 0}
		<p class="text-base-content/60 py-8 text-center">Toutes les fiches sont cachées.</p>
	{/if}

	<!-- items-start : une carte détaillée s'allonge sans étirer ses voisines. -->
	<ul class="grid {GRID[prefs.cardSize]}">
		{#each results as entry (entry.id)}
			<EntryCard
				{entry}
				{selecting}
				selected={selected.includes(entry.id)}
				onzoom={() => openZoom(entry.id)}
				ontoggle={() => toggleSelected(entry.id)}
			/>
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

{#if selecting}
	<BulkToolbar items={results} bind:selected onclose={stopSelecting} />
{:else if entries.active}
	<NewEntryButton />
{/if}
