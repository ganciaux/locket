<script lang="ts">
	// Administration des tags de la collection active : catégories, ajout, renommage, catégorie, place dans le filtre
	// et suppression.
	// Le catalogue est chiffré comme les fiches ; les catégories vivent dans la collection.
	import { page } from '$app/state';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagGroupManager from '$lib/components/TagGroupManager.svelte';
	import { FILTER_LEVELS, type FilterLevel, MAX_LABEL_LENGTH, effectiveGroupId, filterLevel, groupTags } from '$lib/entries/model';
	import {
		addTag,
		deleteAllTags,
		deleteTag,
		renameTag,
		selectCollection,
		setTagFilter,
		setTagGroup
	} from '$lib/entries/collections';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let name = $state('');
	let groupId = $state('');
	let error = $state('');

	// Depuis les paramètres : sélecteur de collection et retour aux paramètres ;
	// sinon en-tête des pages de la collection (son menu, retour aux fiches).
	const fromSettings = $derived(page.url.searchParams.get('from') === 'settings');

	let confirmId = $state<string | null>(null);
	let editId = $state<string | null>(null);
	let editName = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const addForm = formAction(async () => {
		await addTag(name, groupId || undefined);
		name = '';
	});

	const sections = $derived(groupTags(entries.tags ?? [], entries.tagGroups));

	// Tous les tags de la collection : les fiches les perdent, comme pour une suppression un par un.
	let confirmAll = $state(false);
	const removeAll = formAction(async () => {
		if (entries.active) await deleteAllTags(entries.active.id);
		confirmAll = false;
	});

	// Refusé (nom déjà pris dans la catégorie) : le menu revient sur la catégorie actuelle.
	async function changeGroup(id: string, select: HTMLSelectElement, current: string) {
		error = '';
		try {
			await setTagGroup(id, select.value || undefined);
		} catch (e) {
			select.value = current;
			error = errorMessage(e);
		}
	}

	async function changeFilter(id: string, level: FilterLevel) {
		error = '';
		try {
			await setTagFilter(id, level);
		} catch (e) {
			error = errorMessage(e);
		}
	}

	function startEdit(id: string, name: string) {
		confirmId = null;
		editId = id;
		editName = name;
	}

	const rename = formAction(async () => {
		if (editId) await renameTag(editId, editName);
		editId = null;
	});

	const removal = formAction(async () => {
		if (confirmId) await deleteTag(confirmId);
		confirmId = null;
	});
</script>

{#if fromSettings}
	<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
	<h1 class="mb-2 text-2xl font-bold">Tags</h1>
{:else}
	<CollectionHeader onselect={() => ((editId = confirmId = null), (confirmAll = false))} />
	<h2 class="mb-2 text-xl font-bold">Tags</h2>
{/if}

<ErrorAlert message={error} />

{#if !error && !entries.collections}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if !entries.active}
	<p class="text-base-content/60 py-8 text-center">
		Les tags sont propres à chaque collection. <a class="link link-primary" href="/collections">Créez d'abord une collection</a>.
	</p>
{:else if entries.tags && entries.collections}
	{#if fromSettings}
		<label class="text-base-content/70 mb-4 flex items-center gap-2 text-sm">
			Collection
			<select
				class="select select-sm w-auto"
				value={entries.active.id}
				onchange={(e) => ((editId = confirmId = null), (confirmAll = false), selectCollection(e.currentTarget.value))}
			>
				{#each entries.shownCollections ?? [] as collection (collection.id)}
					<option value={collection.id}>{collection.name}</option>
				{/each}
			</select>
		</label>
	{/if}
	<div class="flex flex-col gap-4">
		<TagGroupManager collectionId={entries.active.id} />

		<form class="card bg-base-100 shadow-sm" onsubmit={addForm.submit}>
			<div class="card-body gap-3">
				{#if entries.tagGroups.length}
					<select class="select select-sm w-full" aria-label="Catégorie du nouveau tag" bind:value={groupId}>
						<option value="">Sans catégorie</option>
						{#each entries.tagGroups as group (group.id)}
							<option value={group.id}>{group.name}</option>
						{/each}
					</select>
				{/if}
				<div class="join w-full">
					<input
						class="input join-item w-full"
						placeholder="Nouveau tag"
						aria-label="Nouveau tag"
						maxlength={MAX_LABEL_LENGTH}
						bind:value={name}
						required
					/>
					<button class="btn btn-primary join-item" disabled={addForm.busy}>
						{#if addForm.busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="plus" class="size-4" />{/if}
						Ajouter
					</button>
				</div>
				<ErrorAlert message={addForm.error} />
			</div>
		</form>

		{#if entries.tags.length === 0}
			<p class="text-base-content/60 py-8 text-center">Aucun tag dans « {entries.active.name} » pour l'instant.</p>
		{:else}
			{#each sections as section (section.group?.id ?? '')}
				<section class="flex flex-col gap-2">
					{#if entries.tagGroups.length}
						<h2 class="text-base-content/70 px-1 text-sm font-semibold">{section.group?.name ?? 'Sans catégorie'}</h2>
					{/if}
					<ul class="card bg-base-100 divide-base-200 divide-y shadow-sm">
						{#each section.tags as tag (tag.id)}
							{@const count = entries.countWithTag(tag.id)}
							<li class="flex flex-col gap-2 p-4">
								{#if editId === tag.id}
									<form class="flex flex-col gap-2" onsubmit={rename.submit}>
										<div class="join w-full">
											<!-- svelte-ignore a11y_autofocus -->
											<input
												class="input input-sm join-item w-full"
												aria-label="Nouveau nom du tag"
												maxlength={MAX_LABEL_LENGTH}
												bind:value={editName}
												required
												autofocus
											/>
											<button class="btn btn-primary btn-sm join-item" disabled={rename.busy}>Renommer</button>
											<button type="button" class="btn btn-ghost btn-sm join-item" onclick={() => (editId = null)}>Annuler</button>
										</div>
										<ErrorAlert message={rename.error} />
									</form>
								{:else}
									<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
										<Icon name="tag" class="text-primary size-4" />
										<span class="flex-1 font-medium break-all">{tag.name}</span>
										<!-- Sous le nom sur mobile, à côté dès que la place le permet. -->
										<select
											class="select select-xs order-last w-full sm:order-none sm:w-40"
											aria-label="Filtre du tag {tag.name}"
											value={filterLevel(tag)}
											onchange={(e) => changeFilter(tag.id, e.currentTarget.value as FilterLevel)}
										>
											{#each FILTER_LEVELS as level (level.value)}
												<option value={level.value}>{level.label}</option>
											{/each}
										</select>
										{#if entries.tagGroups.length}
											<select
												class="select select-xs order-last w-full sm:order-none sm:w-36"
												aria-label="Catégorie du tag {tag.name}"
												value={effectiveGroupId(tag, entries.tagGroups) ?? ''}
												onchange={(e) => changeGroup(tag.id, e.currentTarget, effectiveGroupId(tag, entries.tagGroups) ?? '')}
											>
												<option value="">Sans catégorie</option>
												{#each entries.tagGroups as group (group.id)}
													<option value={group.id}>{group.name}</option>
												{/each}
											</select>
										{/if}
										<span class="text-base-content/60 text-xs">{count} fiche{count > 1 ? 's' : ''}</span>
										{#if confirmId !== tag.id}
											<button
												class="btn btn-ghost btn-sm btn-square"
												onclick={() => startEdit(tag.id, tag.name)}
												aria-label="Renommer le tag {tag.name}"
												title="Renommer"
											>
												<Icon name="edit" class="size-4" />
											</button>
											<button
												class="btn btn-ghost btn-sm btn-square text-error"
												onclick={() => ((confirmId = tag.id), (editId = null))}
												aria-label="Supprimer le tag {tag.name}"
												title="Supprimer"
											>
												<Icon name="trash" class="size-4" />
											</button>
										{/if}
									</div>
									{#if confirmId === tag.id}
										<form class="alert alert-error alert-soft flex flex-wrap items-center gap-2" onsubmit={removal.submit}>
											<span class="flex-1 text-sm">
												Supprimer « {tag.name} »{count ? ` et le retirer de ${count} fiche${count > 1 ? 's' : ''}` : ''} ?
											</span>
											<button class="btn btn-error btn-sm" disabled={removal.busy}>Supprimer</button>
											<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmId = null)}>Annuler</button>
											<ErrorAlert message={removal.error} />
										</form>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}

			{#if entries.tags.length > 1}
				{#if confirmAll}
					{@const tagged = (entries.activeItems ?? []).filter((item) => entries.tagsOf(item).length).length}
					<form class="alert alert-error alert-soft flex flex-wrap items-center gap-2" onsubmit={removeAll.submit}>
						<span class="flex-1 text-sm">
							Supprimer les {entries.tags.length} tags de « {entries.active.name} »{tagged
								? ` et les retirer de ${tagged} fiche${tagged > 1 ? 's' : ''}`
								: ''} ? Les catégories restent.
						</span>
						<button class="btn btn-error btn-sm" disabled={removeAll.busy}>Tout supprimer</button>
						<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmAll = false)}>Annuler</button>
						<ErrorAlert message={removeAll.error} />
					</form>
				{:else}
					<button class="btn btn-ghost btn-sm text-error self-start" onclick={() => (confirmAll = true)}>
						<Icon name="trash" class="size-4" /> Supprimer tous les tags
					</button>
				{/if}
			{/if}
		{/if}
	</div>
{/if}
