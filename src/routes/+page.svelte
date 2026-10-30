<script lang="ts">
	import { session } from '$lib/auth/session.svelte';
	import { daysSince, isReminderDue, readBackupInfo, snoozeReminder } from '$lib/backup/reminder';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { listView } from '$lib/entries/listView.svelte';
	import {
		MAX_LABEL_LENGTH,
		NO_TAG_FILTER,
		type SortOrder,
		TRASH_DAYS,
		UNRATED,
		countryFlag,
		countryName,
		linkTitle
	} from '$lib/entries/model';
	import {
		addCollection,
		changeEntriesSites,
		changeEntriesTags,
		deleteForever,
		deleteUnreadableEntries,
		entries,
		loadEntries,
		reshuffle,
		setEntriesHidden,
		trashEntries
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
		{ value: 'random', label: 'Tri : aléatoire' }
	];
	// Note minimale, en demi-étoiles : 6 = 3 étoiles.
	const RATINGS: { value: number; label: string }[] = [
		{ value: 0, label: 'Toutes les notes' },
		{ value: 2, label: '★ 1 et plus' },
		{ value: 4, label: '★ 2 et plus' },
		{ value: 6, label: '★ 3 et plus' },
		{ value: 8, label: '★ 4 et plus' },
		{ value: 9, label: '★ 4,5 et plus' },
		{ value: 10, label: '★ 5' },
		{ value: UNRATED, label: 'Sans note' }
	];

	// Filtres et tri : gardés pendant la session, valeurs par défaut à chaque déverrouillage (voir listView).
	const tagFilter = $derived(listView.tags);
	// Valeur de départ : la préférence de Paramètres ; la bascule de la liste ne vaut que pour la visite.
	let detailed = $state(prefs.detailedCards);
	// Cartes compactes : une seule dépliée à la fois.
	let openId = $state<string | null>(null);
	const clickExpands = $derived(!detailed && prefs.cardClick === 'expand');
	const toggleOpen = (id: string) => (openId = openId === id ? null : id);
	let error = $state('');
	const backupInfo = readBackupInfo();
	let remindBackup = $state(isReminderDue(backupInfo, Date.now()));

	function remindLater() {
		snoozeReminder();
		remindBackup = false;
	}

	loadEntries().catch((e) => (error = errorMessage(e)));

	const anyLinks = $derived((entries.activeItems ?? []).some((item) => entries.linksOf(item).length > 0));
	const anyRated = $derived((entries.activeItems ?? []).some((item) => item.rating));
	const results = $derived(
		entries.search(listView.query, {
			tags: listView.tags,
			// Sans aucune fiche avec liens dans la collection, le filtre par défaut viderait la liste : ignoré.
			withLinks: listView.withLinks && anyLinks,
			rating: listView.rating,
			country: listView.country,
			order: listView.sort
		})
	);
	const hiddenCount = $derived((entries.activeItems ?? []).filter((item) => item.hidden).length);
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

	// Sélection multiple : limitée aux fiches affichées.
	let selecting = $state(false);
	let selected = $state<string[]>([]);
	let bulkPanel = $state<'tags' | 'sites' | 'trash' | null>(null);
	let bulkTags = $state<string[]>([]);
	let bulkSites = $state<string[]>([]);
	// Sites de la collection, au format attendu par TagPicker.
	const siteChoices = $derived(
		entries.active
			? entries.sitesIn(entries.active.id).map((site) => ({ id: site.id, name: site.label, collectionId: site.id }))
			: []
	);
	let bulkBusy = $state(false);
	let bulkError = $state('');
	const selectedItems = $derived(results.filter((entry) => selected.includes(entry.id)));
	const allHidden = $derived(selectedItems.length > 0 && selectedItems.every((entry) => entry.hidden));
	const allSelected = $derived(results.length > 0 && selectedItems.length === results.length);

	// « Tout » est une bascule : tout sélectionner, puis tout désélectionner.
	function toggleAll() {
		selected = allSelected ? [] : results.map((entry) => entry.id);
	}

	function stopSelecting() {
		selecting = false;
		selected = [];
		closePanel();
		bulkError = '';
	}

	function closePanel() {
		bulkPanel = null;
		bulkTags = [];
		bulkSites = [];
	}

	function toggleSelected(id: string) {
		selected = selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id];
	}

	async function applyBulk(action: () => Promise<void>) {
		if (bulkBusy) return;
		bulkBusy = true;
		bulkError = '';
		try {
			await action();
			// La sélection reste ouverte pour enchaîner ; seules les fiches encore affichées restent cochées.
			closePanel();
			selected = selected.filter((id) => results.some((entry) => entry.id === id));
		} catch (e) {
			bulkError = errorMessage(e);
		} finally {
			bulkBusy = false;
		}
	}

	const tagFiltering = $derived(tagFilter.untagged || tagFilter.tagIds.length > 0);
	const filterActive = $derived(
		tagFiltering || (listView.withLinks && anyLinks) || listView.rating !== 0 || !!listView.country
	);
	const filtering = $derived(!!listView.query.trim() || filterActive);

	// Les tags sont propres à chaque collection : le filtre ne survit pas au changement.
	function resetTagFilter() {
		listView.tags = { ...NO_TAG_FILTER, mode: listView.tags.mode };
	}

	/** « Effacer » : tout afficher (les valeurs par défaut reviennent au prochain déverrouillage). */
	function clearFilters() {
		resetTagFilter();
		listView.withLinks = false;
		listView.rating = 0;
		listView.country = '';
	}

	let collectionName = $state('');
	const firstCollection = formAction(async () => {
		await addCollection(collectionName);
		collectionName = '';
	});

	// « Sans tag » et les tags sélectionnés s'excluent : cocher l'un décoche l'autre.
	function toggleUntagged() {
		listView.tags.untagged = !listView.tags.untagged;
		if (listView.tags.untagged) listView.tags.tagIds = [];
	}
</script>

<!-- items-baseline : le compteur s'aligne sur le texte du titre, pas sur sa boîte (jambages compris). -->
<div class="mb-4 flex items-center gap-2">
	{#if entries.active}
		<CollectionSwitcher onselect={resetTagFilter} />
		<a class="btn btn-ghost btn-sm shrink-0" href="/entry/import"><Icon name="import" class="size-4" /> Importer</a>
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
			<a class="btn btn-sm" href="/backup">Restaurer</a>
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmPurge = true)}>Supprimer</button>
		{/if}
		<ErrorAlert message={purge.error} />
	</form>
{/if}

{#if !error && !entries.collections}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
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
					: 'Aucune sauvegarde depuis cet appareil.'}
			</span>
			<div class="ml-auto flex gap-2">
				<button class="btn btn-ghost btn-sm" onclick={remindLater}>Plus tard</button>
				<a class="btn btn-sm" href="/backup">Sauvegarder</a>
			</div>
		</div>
	{/if}
	<label class="input mb-3 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input type="search" placeholder="Rechercher dans {entries.active?.name}" aria-label="Rechercher" bind:value={listView.query} />
	</label>

	<!--
		Filtres : liens, note et pays sur une ligne, puis les tags ; OU / ET n'a de sens qu'à partir de deux tags
		sélectionnés. Valeurs par défaut à chaque déverrouillage : avec liens, toutes les notes, tous les pays, aucun tag.
	-->
	{#if entries.tags?.length || anyLinks || anyRated || countries.length}
		<div class="mb-3 flex flex-col gap-2">
			<div class="flex min-h-6 items-center gap-2">
				<span class="text-base-content/60 text-xs">Filtrer</span>
				{#if tagFilter.tagIds.length > 1}
					<div class="join" role="radiogroup" aria-label="Mode de filtre des tags">
						<input
							class="join-item btn btn-xs"
							type="radio"
							name="tag-mode"
							value="or"
							aria-label="OU"
							title="Au moins un des tags sélectionnés"
							bind:group={listView.tags.mode}
						/>
						<input
							class="join-item btn btn-xs"
							type="radio"
							name="tag-mode"
							value="and"
							aria-label="ET"
							title="Tous les tags sélectionnés"
							bind:group={listView.tags.mode}
						/>
					</div>
				{/if}
				{#if filterActive}
					<button class="btn btn-ghost btn-xs ml-auto" onclick={clearFilters}>Effacer</button>
				{/if}
			</div>
			{#if anyLinks || anyRated || countries.length}
				<div class="flex flex-wrap items-center gap-2">
					{#if anyLinks}
						<button
							type="button"
							class="badge badge-lg cursor-pointer gap-1 {listView.withLinks ? 'badge-primary' : 'badge-outline border-dashed'}"
							aria-pressed={listView.withLinks}
							title={listView.withLinks ? 'Afficher aussi les fiches sans lien' : 'Seulement les fiches avec liens'}
							onclick={() => (listView.withLinks = !listView.withLinks)}
						>
							<Icon name="link" class="size-3" /> Avec liens
						</button>
					{/if}
					{#if anyRated}
						<select class="select select-sm w-auto" aria-label="Filtrer par note" bind:value={listView.rating}>
							{#each RATINGS as rating (rating.value)}
								<option value={rating.value}>{rating.label}</option>
							{/each}
						</select>
					{/if}
					{#if countries.length}
						<select class="select select-sm w-auto" aria-label="Filtrer par pays" bind:value={listView.country}>
							<option value="">Tous les pays</option>
							{#each countries as country (country.code)}
								<option value={country.code}>{countryFlag(country.code)} {country.name} ({country.count})</option>
							{/each}
							<option value="none">Sans pays</option>
						</select>
					{/if}
				</div>
			{/if}
			{#if entries.tags?.length}
				<TagPicker
					tags={entries.tags}
					bind:selected={listView.tags.tagIds}
					label="Filtrer par tags"
					onchange={(selected) => selected.length && (listView.tags.untagged = false)}
				>
					{#snippet before()}
						<button
							type="button"
							class="badge badge-lg cursor-pointer italic {tagFilter.untagged ? 'badge-primary' : 'badge-outline border-dashed'}"
							aria-pressed={tagFilter.untagged}
							onclick={toggleUntagged}
						>
							Sans tag
						</button>
					{/snippet}
				</TagPicker>
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
			{#if listView.sort === 'random'}
				<button class="btn btn-ghost btn-xs btn-square" onclick={reshuffle} aria-label="Remélanger" title="Remélanger">
					<Icon name="shuffle" class="size-4" />
				</button>
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
			<button
				class="btn btn-xs {detailed ? 'btn-primary' : 'btn-ghost'}"
				aria-pressed={detailed}
				title={detailed ? 'Cartes compactes' : 'Afficher tags et liens sur toutes les cartes'}
				onclick={() => (detailed = !detailed)}
			>
				Détails
				<Icon name="chevronDown" class="size-3 transition {detailed ? 'rotate-180' : ''}" />
			</button>
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

	{#snippet cardHeader(entry: (typeof results)[number], expandable: boolean, isOpen: boolean)}
		<figure class="bg-primary/10 relative aspect-square">
			{#if entry.thumbUrl}
				<img src={entry.thumbUrl} alt="" class="size-full object-cover" />
			{:else}
				<span class="text-primary font-bold {prefs.cardSize === 'small' ? 'text-3xl' : 'text-5xl'}" aria-hidden="true">
					{entry.name.charAt(0).toUpperCase()}
				</span>
			{/if}
			{#if entry.rating}
				<!-- Sur l'image pour gagner une ligne ; fond translucide pour rester lisible sur une photo claire. -->
				<span class="bg-base-100/80 rounded-box absolute bottom-1 left-1 flex px-1 py-0.5">
					<Rating value={entry.rating} size="xs" />
				</span>
			{/if}
		</figure>
		<h2
			class="flex items-center gap-1 font-semibold {prefs.cardSize === 'small'
				? 'px-2 py-1.5 text-xs'
				: prefs.cardSize === 'large'
					? 'px-4 py-3 text-base'
					: 'px-3 py-2 text-sm'}"
		>
			{#if entry.country}<span title={countryName(entry.country)}>{countryFlag(entry.country)}</span>{/if}
			<span class="min-w-0 flex-1 truncate">{entry.name}</span>
			{#if expandable}
				<Icon name="chevronDown" class="text-base-content/50 size-4 shrink-0 transition {isOpen ? 'rotate-180' : ''}" />
			{/if}
		</h2>
	{/snippet}

	<!-- items-start : une carte dépliée s'allonge sans étirer ses voisines. -->
	<ul class="grid items-start {GRID[prefs.cardSize]}">
		{#each results as entry (entry.id)}
			{@const links = entries.linksOf(entry)}
			{@const isSelected = selected.includes(entry.id)}
			{@const entryTags = entries.tagsOf(entry)}
			{@const isOpen = detailed || openId === entry.id}
			<li
				class="card bg-base-100 relative overflow-hidden shadow-sm transition hover:shadow-md {entry.hidden
					? 'opacity-50 hover:opacity-100'
					: ''} {isSelected ? 'outline-primary outline-2 -outline-offset-2' : ''}"
			>
				{#if selecting}
					<input
						type="checkbox"
						class="checkbox checkbox-sm bg-base-100 absolute top-2 left-2 z-10"
						checked={isSelected}
						onchange={() => toggleSelected(entry.id)}
						aria-label="Sélectionner {entry.name}"
					/>
				{/if}
				<!-- En mode sélection, un clic sur la carte coche la fiche ; sinon il la déplie ou l'ouvre (Paramètres). -->
				{#if clickExpands && !selecting}
					<button type="button" class="block w-full cursor-pointer text-left" aria-expanded={isOpen} onclick={() => toggleOpen(entry.id)}>
						{@render cardHeader(entry, true, isOpen)}
					</button>
				{:else}
					<a
						href="/entry/{entry.id}"
						class="block"
						onclick={(event) => {
							if (!selecting) return;
							event.preventDefault();
							toggleSelected(entry.id);
						}}
					>
						{@render cardHeader(entry, false, isOpen)}
					</a>
					{#if !detailed && (entryTags.length || links.length)}
						<button
							type="button"
							class="text-base-content/60 hover:bg-base-200 border-base-200 flex w-full cursor-pointer items-center gap-1 border-t px-3 py-1.5 text-xs"
							aria-expanded={isOpen}
							onclick={() => toggleOpen(entry.id)}
						>
							<span class="flex-1 text-left">Détails</span>
							<Icon name="chevronDown" class="size-4 transition {isOpen ? 'rotate-180' : ''}" />
						</button>
					{/if}
				{/if}

				<!-- Hors du lien de la carte : on ne peut pas imbriquer des éléments cliquables dans un <a>. -->
				{#if isOpen}
					{#if entryTags.length}
						<div class="flex flex-wrap gap-1 px-3 pb-2">
							{#each entryTags as tag (tag.id)}
								<span class="badge badge-soft badge-primary badge-xs">{tag.name}</span>
							{/each}
						</div>
					{/if}
					{#if links.length}
						<ul class="border-base-200 flex flex-col gap-1 border-t px-3 py-2 text-sm">
							{#each links as link, i (i)}
								<li class="truncate"><ExternalLink url={link.url}>{linkTitle(link)}</ExternalLink></li>
							{/each}
						</ul>
					{/if}
					{#if clickExpands}
						<a
							class="btn btn-ghost btn-xs border-base-200 w-full justify-between rounded-none border-t"
							href="/entry/{entry.id}"
							aria-label="Ouvrir la fiche"
						>
							{prefs.cardSize === 'small' ? 'Ouvrir' : 'Ouvrir la fiche'} <Icon name="chevronRight" class="size-4" />
						</a>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if selecting}
	<div
		role="toolbar"
		aria-label="Actions sur la sélection"
		class="bg-base-100 fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.15)]"
	>
		<ErrorAlert message={bulkError} />
		{#if bulkPanel === 'tags'}
			<TagPicker tags={entries.tags ?? []} bind:selected={bulkTags} label="Tags à ajouter, retirer ou définir" />
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-primary btn-sm"
					disabled={bulkBusy || !bulkTags.length}
					onclick={() => applyBulk(() => changeEntriesTags(selectedItems, bulkTags, 'add'))}
				>
					Ajouter
				</button>
				<button
					class="btn btn-outline btn-sm"
					disabled={bulkBusy || !bulkTags.length}
					onclick={() => applyBulk(() => changeEntriesTags(selectedItems, bulkTags, 'remove'))}
				>
					Retirer
				</button>
				<button
					class="btn btn-outline btn-sm"
					disabled={bulkBusy}
					title="Les fiches auront exactement ces tags"
					onclick={() => applyBulk(() => changeEntriesTags(selectedItems, bulkTags, 'set'))}
				>
					{bulkTags.length ? 'Définir' : 'Retirer tous'}
				</button>
				<button class="btn btn-ghost btn-sm" onclick={closePanel}>Retour</button>
			</div>
		{:else if bulkPanel === 'sites'}
			<p class="text-sm">Sites de la collection à afficher ou masquer sur les fiches sélectionnées ; « Définir » n'affiche que ceux-là :</p>
			<TagPicker tags={siteChoices} bind:selected={bulkSites} label="Sites à afficher, masquer ou définir" />
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-primary btn-sm"
					disabled={bulkBusy || !bulkSites.length}
					onclick={() => applyBulk(() => changeEntriesSites(selectedItems, bulkSites, 'show'))}
				>
					Afficher
				</button>
				<button
					class="btn btn-outline btn-sm"
					disabled={bulkBusy || !bulkSites.length}
					onclick={() => applyBulk(() => changeEntriesSites(selectedItems, bulkSites, 'hide'))}
				>
					Masquer
				</button>
				<button
					class="btn btn-outline btn-sm"
					disabled={bulkBusy}
					title="Seuls ces sites restent affichés"
					onclick={() => applyBulk(() => changeEntriesSites(selectedItems, bulkSites, 'set'))}
				>
					{bulkSites.length ? 'Définir' : 'Masquer tous'}
				</button>
				<button class="btn btn-ghost btn-sm" onclick={closePanel}>Retour</button>
			</div>
		{:else if bulkPanel === 'trash'}
			{@const count = selectedItems.length}
			<p class="text-sm">
				Supprimer {count} fiche{count > 1 ? 's' : ''} ? La corbeille les garde {TRASH_DAYS} jours ; la suppression définitive
				est irréversible.
			</p>
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-error btn-sm" disabled={bulkBusy} onclick={() => applyBulk(() => trashEntries(selectedItems))}>
					Mettre à la corbeille
				</button>
				<button
					class="btn btn-error btn-outline btn-sm"
					disabled={bulkBusy}
					onclick={() => applyBulk(() => deleteForever(selectedItems))}
				>
					Supprimer définitivement
				</button>
				<button class="btn btn-ghost btn-sm" onclick={closePanel}>Retour</button>
			</div>
		{:else}
			<div class="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2">
				<span class="text-sm font-medium" role="status">
					{selectedItems.length} sélectionnée{selectedItems.length > 1 ? 's' : ''}
				</span>
				<button class="btn btn-sm {allSelected ? 'btn-primary' : 'btn-ghost'}" aria-pressed={allSelected} onclick={toggleAll}>
					Tout
				</button>
				<button
					class="btn btn-sm"
					disabled={bulkBusy || !selectedItems.length}
					onclick={() => applyBulk(() => setEntriesHidden(selectedItems, !allHidden))}
				>
					{allHidden ? 'Afficher' : 'Cacher'}
				</button>
				{#if entries.tags?.length}
					<button class="btn btn-sm" disabled={!selectedItems.length} onclick={() => (bulkPanel = 'tags')}>Tags</button>
				{/if}
				{#if siteChoices.length}
					<button class="btn btn-sm" disabled={!selectedItems.length} onclick={() => (bulkPanel = 'sites')}>Liens</button>
				{/if}
				<button class="btn btn-sm btn-error btn-outline" disabled={!selectedItems.length} onclick={() => (bulkPanel = 'trash')}>
					Supprimer
				</button>
				<button class="btn btn-ghost btn-sm btn-square ml-auto" onclick={stopSelecting} aria-label="Quitter la sélection" title="Quitter">
					<Icon name="close" class="size-4" />
				</button>
			</div>
		{/if}
	</div>
{:else if entries.active}
	<a
		href="/entry/new"
		class="btn btn-primary btn-circle btn-lg fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg"
		aria-label="Nouvelle fiche"
		title="Nouvelle fiche"
	>
		<Icon name="plus" class="size-7" />
	</a>
{/if}
