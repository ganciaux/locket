<script lang="ts">
	import { daysSince, isReminderDue, readBackupInfo, snoozeReminder } from '$lib/backup/reminder';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { MAX_LABEL_LENGTH, NO_TAG_FILTER, type SortOrder, type TagFilter, linkTitle } from '$lib/entries/model';
	import { addCollection, entries, loadEntries } from '$lib/entries/store.svelte';
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
	const SORTS: { value: SortOrder; label: string }[] = [
		{ value: 'name', label: 'Nom' },
		{ value: 'created', label: 'Créées récemment' },
		{ value: 'updated', label: 'Modifiées récemment' }
	];

	let query = $state('');
	let tagFilter = $state<TagFilter>({ ...NO_TAG_FILTER });
	let error = $state('');
	const backupInfo = readBackupInfo();
	let remindBackup = $state(isReminderDue(backupInfo, Date.now()));

	function remindLater() {
		snoozeReminder();
		remindBackup = false;
	}

	loadEntries().catch((e) => (error = errorMessage(e)));

	const results = $derived(entries.search(query, tagFilter, prefs.sort));
	const tagFiltering = $derived(tagFilter.untagged || tagFilter.tagIds.length > 0);
	const filtering = $derived(!!query.trim() || tagFiltering);

	// Les tags sont propres à chaque collection : le filtre ne survit pas au changement.
	const resetTagFilter = () => (tagFilter = { ...NO_TAG_FILTER, mode: tagFilter.mode });

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
		<a class="btn btn-ghost btn-sm shrink-0" href="/fiche/import"><Icon name="import" class="size-4" /> Importer</a>
	{:else}
		<h1 class="text-2xl font-bold">Mes fiches</h1>
	{/if}
</div>

<ErrorAlert message={error} />

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
		<a class="btn btn-primary" href="/fiche/nouvelle"><Icon name="plus" /> Créer une fiche</a>
	</div>
{:else if entries.activeItems}
	{#if remindBackup}
		<div role="status" class="alert alert-warning alert-soft mb-3">
			<span class="text-sm">
				{backupInfo.lastAt
					? `Dernière sauvegarde il y a ${daysSince(backupInfo.lastAt, Date.now())} jours.`
					: 'Aucune sauvegarde depuis cet appareil.'}
			</span>
			<div class="flex gap-2">
				<button class="btn btn-ghost btn-sm" onclick={remindLater}>Plus tard</button>
				<a class="btn btn-sm" href="/sauvegarde">Sauvegarder</a>
			</div>
		</div>
	{/if}
	<label class="input mb-3 w-full">
		<Icon name="search" class="size-4 opacity-50" />
		<input type="search" placeholder="Rechercher dans {entries.active?.name} (nom ou tag)" aria-label="Rechercher" bind:value={query} />
	</label>

	<div class="mb-4 flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			{#if entries.tags?.length}
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
					<button class="btn btn-ghost btn-xs" onclick={() => (tagFilter = { ...NO_TAG_FILTER, mode: tagFilter.mode })}>
						Effacer
					</button>
				{/if}
			{/if}
			<select class="select select-xs ml-auto w-auto" aria-label="Trier par" bind:value={prefs.sort}>
				{#each SORTS as sort (sort.value)}
					<option value={sort.value}>{sort.label}</option>
				{/each}
			</select>
			<span class="text-base-content/60 text-xs">Taille</span>
			<div class="join" role="radiogroup" aria-label="Taille des cartes">
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

	{#if results.length === 0 && filtering}
		<p class="text-base-content/60 py-8 text-center">Aucune fiche ne correspond.</p>
	{/if}

	<!-- items-start : une carte dont on ouvre les liens s'allonge sans étirer ses voisines. -->
	<ul class="grid items-start {GRID[prefs.cardSize]}">
		{#each results as entry (entry.id)}
			<li class="card bg-base-100 overflow-hidden shadow-sm transition hover:shadow-md">
				<a href="/fiche/{entry.id}" class="block">
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

{#if entries.active}
	<a
		href="/fiche/nouvelle"
		class="btn btn-primary btn-circle btn-lg fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg"
		aria-label="Nouvelle fiche"
		title="Nouvelle fiche"
	>
		<Icon name="plus" class="size-7" />
	</a>
{/if}
