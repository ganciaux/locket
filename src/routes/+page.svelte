<script lang="ts">
	import { session } from '$lib/auth/session.svelte';
	import { daysSince, isReminderDue, readBackupInfo, snoozeReminder } from '$lib/backup/reminder';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import {
		type LinkFilter,
		MAX_LABEL_LENGTH,
		NO_TAG_FILTER,
		type SortOrder,
		type TagFilter,
		TRASH_DAYS,
		linkTitle
	} from '$lib/entries/model';
	import {
		addCollection,
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
		{ value: 'random', label: 'Tri : aléatoire' }
	];

	let query = $state('');
	let tagFilter = $state<TagFilter>({ ...NO_TAG_FILTER });
	let linkFilter = $state<LinkFilter>('all');
	// Valeur de départ : la préférence de Paramètres ; la bascule de la liste ne vaut que pour la visite.
	let linksExpanded = $state(prefs.cardLinksExpanded);
	let error = $state('');
	const backupInfo = readBackupInfo();
	let remindBackup = $state(isReminderDue(backupInfo, Date.now()));

	function remindLater() {
		snoozeReminder();
		remindBackup = false;
	}

	loadEntries().catch((e) => (error = errorMessage(e)));

	const results = $derived(entries.search(query, tagFilter, prefs.sort, linkFilter));
	const hiddenCount = $derived((entries.activeItems ?? []).filter((item) => item.hidden).length);
	const anyLinks = $derived((entries.activeItems ?? []).some((item) => entries.linksOf(item).length > 0));

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
	let bulkPanel = $state<'tags' | 'trash' | null>(null);
	let bulkTags = $state<string[]>([]);
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
		bulkTags = [];
		bulkPanel = null;
		bulkError = '';
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
			stopSelecting();
		} catch (e) {
			bulkError = errorMessage(e);
		} finally {
			bulkBusy = false;
		}
	}

	const tagFiltering = $derived(tagFilter.untagged || tagFilter.tagIds.length > 0);
	const filtering = $derived(!!query.trim() || tagFiltering || linkFilter !== 'all');

	// Les tags sont propres à chaque collection : le filtre ne survit pas au changement.
	const resetTagFilter = () => (tagFilter = { ...NO_TAG_FILTER, mode: tagFilter.mode });

	function clearFilters() {
		resetTagFilter();
		linkFilter = 'all';
	}

	// « Avec » et « Sans » s'excluent ; recliquer sur le filtre actif l'enlève.
	const toggleLinkFilter = (value: LinkFilter) => (linkFilter = linkFilter === value ? 'all' : value);

	let collectionName = $state('');
	const firstCollection = formAction(async () => {
		await addCollection(collectionName);
		collectionName = '';
	});

	// « Sans tag » et les tags sélectionnés s'excluent : cocher l'un décoche l'autre.
	function toggleUntagged() {
		tagFilter.untagged = !tagFilter.untagged;
		if (tagFilter.untagged) tagFilter.tagIds = [];
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
		<input type="search" placeholder="Rechercher dans {entries.active?.name}" aria-label="Rechercher" bind:value={query} />
	</label>

	<!-- Filtres : liens et tags ; OU / ET n'a de sens qu'à partir de deux tags sélectionnés. -->
	{#if entries.tags?.length || anyLinks}
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
				{/if}
				{#if tagFiltering || linkFilter !== 'all'}
					<button class="btn btn-ghost btn-xs ml-auto" onclick={clearFilters}>Effacer</button>
				{/if}
			</div>
			{#if anyLinks}
				<div class="flex flex-wrap gap-2" role="group" aria-label="Filtrer par liens">
					{#each [{ value: 'with', label: 'Avec liens' }, { value: 'without', label: 'Sans lien' }] as option (option.value)}
						{@const active = linkFilter === option.value}
						<button
							type="button"
							class="badge badge-lg cursor-pointer gap-1 {active ? 'badge-primary' : 'badge-outline border-dashed'}"
							aria-pressed={active}
							onclick={() => toggleLinkFilter(option.value as LinkFilter)}
						>
							<Icon name="link" class="size-3" />
							{option.label}
						</button>
					{/each}
				</div>
			{/if}
			{#if entries.tags?.length}
				<TagPicker
					tags={entries.tags}
					bind:selected={tagFilter.tagIds}
					label="Filtrer par tags"
					onchange={(selected) => selected.length && (tagFilter.untagged = false)}
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
			<select class="select select-xs ml-auto w-auto" aria-label="Trier par" bind:value={prefs.sort}>
				{#each SORTS as sort (sort.value)}
					<option value={sort.value}>{sort.label}</option>
				{/each}
			</select>
			{#if prefs.sort === 'random'}
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
			{#if anyLinks}
				<button
					class="btn btn-xs {linksExpanded ? 'btn-primary' : 'btn-ghost'}"
					aria-pressed={linksExpanded}
					title={linksExpanded ? 'Replier les liens des cartes' : 'Déplier les liens des cartes'}
					onclick={() => (linksExpanded = !linksExpanded)}
				>
					<Icon name="link" class="size-3" /> Liens
					<Icon name="chevronDown" class="size-3 transition {linksExpanded ? 'rotate-180' : ''}" />
				</button>
			{/if}
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

	<!-- items-start : une carte dont on ouvre les liens s'allonge sans étirer ses voisines. -->
	<ul class="grid items-start {GRID[prefs.cardSize]}">
		{#each results as entry (entry.id)}
			{@const links = entries.linksOf(entry)}
			{@const isSelected = selected.includes(entry.id)}
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
				<!-- En mode sélection, un clic sur la carte coche la fiche au lieu de l'ouvrir. -->
				<a
					href="/entry/{entry.id}"
					class="block"
					onclick={(event) => {
						if (!selecting) return;
						event.preventDefault();
						toggleSelected(entry.id);
					}}
				>
					<figure class="bg-primary/10 aspect-square">
						{#if entry.thumbUrl}
							<img src={entry.thumbUrl} alt="" class="size-full object-cover" />
						{:else}
							<span class="text-primary font-bold {prefs.cardSize === 'small' ? 'text-3xl' : 'text-5xl'}" aria-hidden="true">
								{entry.name.charAt(0).toUpperCase()}
							</span>
						{/if}
					</figure>
					<h2
						class="truncate font-semibold {prefs.cardSize === 'small'
							? 'px-2 pt-2 pb-1 text-xs'
							: prefs.cardSize === 'large'
								? 'px-4 pt-4 pb-2 text-base'
								: 'px-3 pt-3 pb-2 text-sm'}"
					>
						{entry.name}
					</h2>
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
				{#if links.length && linksExpanded}
					<ul class="border-base-200 flex flex-wrap gap-1 border-t p-2">
						{#each links as link, i (i)}
							<li class="badge badge-soft badge-sm max-w-full truncate"><ExternalLink url={link.url}>{linkTitle(link)}</ExternalLink></li>
						{/each}
					</ul>
				{:else if links.length}
					<details class="group border-base-200 border-t">
						<summary
							class="text-base-content/60 hover:bg-base-200 flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-xs [&::-webkit-details-marker]:hidden"
						>
							<Icon name="link" class="size-3" />
							<span class="flex-1">{links.length} lien{links.length > 1 ? 's' : ''}</span>
							<Icon name="chevronDown" class="size-4 transition group-open:rotate-180" />
						</summary>
						<ul class="flex flex-col gap-1 px-3 pb-3 text-sm">
							{#each links as link, i (i)}
								<li class="truncate"><ExternalLink url={link.url}>{linkTitle(link)}</ExternalLink></li>
							{/each}
						</ul>
					</details>
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
			<TagPicker tags={entries.tags ?? []} bind:selected={bulkTags} label="Tags à ajouter ou retirer" />
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
				<button class="btn btn-ghost btn-sm" onclick={() => (bulkPanel = null)}>Retour</button>
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
				<button class="btn btn-ghost btn-sm" onclick={() => (bulkPanel = null)}>Retour</button>
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
