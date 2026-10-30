<script lang="ts">
	// Administration des collections : ajout, renommage, ordre d'affichage et suppression (vide uniquement).
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SiteManager from '$lib/components/SiteManager.svelte';
	import { MAX_LABEL_LENGTH } from '$lib/entries/model';
	import {
		addCollection,
		deleteCollection,
		entries,
		loadEntries,
		moveCollection,
		renameCollection
	} from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let name = $state('');
	let error = $state('');
	let confirmId = $state<string | null>(null);
	let editId = $state<string | null>(null);
	let editName = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const addForm = formAction(async () => {
		await addCollection(name);
		name = '';
	});

	function startEdit(id: string, name: string) {
		confirmId = null;
		editId = id;
		editName = name;
	}

	const rename = formAction(async () => {
		if (editId) await renameCollection(editId, editName);
		editId = null;
	});

	const removal = formAction(async () => {
		if (confirmId) await deleteCollection(confirmId);
		confirmId = null;
	});

	let moving = $state(false);
	async function move(id: string, delta: -1 | 1) {
		if (moving) return;
		moving = true;
		error = '';
		try {
			await moveCollection(id, delta);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			moving = false;
		}
	}
</script>

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-1 text-2xl font-bold">Collections</h1>
<p class="text-base-content/60 mb-4 text-sm">Chaque fiche appartient à une collection, qui a ses propres tags et ses sites.</p>

<ErrorAlert message={error} />

{#if !error && !entries.collections}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.collections}
	{@const collections = entries.collections}
	<div class="flex flex-col gap-4">
		<form class="card bg-base-100 shadow-sm" onsubmit={addForm.submit}>
			<div class="card-body gap-3">
				<div class="join w-full">
					<input
						class="input join-item w-full"
						placeholder="Nouvelle collection"
						aria-label="Nouvelle collection"
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

		{#if collections.length === 0}
			<p class="text-base-content/60 py-8 text-center">Aucune collection pour l'instant.</p>
		{:else}
			<ul class="card bg-base-100 divide-base-200 divide-y shadow-sm">
				{#each collections as collection, i (collection.id)}
					{@const count = entries.countIn(collection.id)}
					<li class="flex flex-col gap-2 p-4">
						{#if editId === collection.id}
							<form class="flex flex-col gap-2" onsubmit={rename.submit}>
								<div class="join w-full">
									<!-- svelte-ignore a11y_autofocus -->
									<input
										class="input input-sm join-item w-full"
										aria-label="Nouveau nom de la collection"
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
							<div class="flex items-center gap-2">
								<div class="flex flex-col">
									<button
										class="btn btn-ghost btn-xs btn-square"
										disabled={i === 0 || moving}
										onclick={() => move(collection.id, -1)}
										aria-label="Monter {collection.name}"
										title="Monter"
									>
										<Icon name="chevronUp" class="size-4" />
									</button>
									<button
										class="btn btn-ghost btn-xs btn-square"
										disabled={i === collections.length - 1 || moving}
										onclick={() => move(collection.id, 1)}
										aria-label="Descendre {collection.name}"
										title="Descendre"
									>
										<Icon name="chevronDown" class="size-4" />
									</button>
								</div>
								<span class="flex-1 font-medium break-all">{collection.name}</span>
								<span class="text-base-content/60 text-xs">{count} fiche{count > 1 ? 's' : ''}</span>
								{#if confirmId !== collection.id}
									<button
										class="btn btn-ghost btn-sm btn-square"
										onclick={() => startEdit(collection.id, collection.name)}
										aria-label="Renommer la collection {collection.name}"
										title="Renommer"
									>
										<Icon name="edit" class="size-4" />
									</button>
									<!-- Une collection non vide ne se supprime pas : aucune fiche ne doit perdre la sienne. -->
									<button
										class="btn btn-ghost btn-sm btn-square text-error"
										disabled={count > 0}
										onclick={() => ((confirmId = collection.id), (editId = null))}
										aria-label="Supprimer la collection {collection.name}"
										title={count ? 'Videz d’abord la collection pour la supprimer' : 'Supprimer'}
									>
										<Icon name="trash" class="size-4" />
									</button>
								{/if}
							</div>
							{#if confirmId === collection.id}
								{@const tagCount = entries.tagsIn(collection.id).length}
								<form class="alert alert-error alert-soft flex flex-wrap items-center gap-2" onsubmit={removal.submit}>
									<span class="flex-1 text-sm">
										Supprimer « {collection.name} »{tagCount ? ` et ses ${tagCount} tag${tagCount > 1 ? 's' : ''}` : ''} ?
									</span>
									<button class="btn btn-error btn-sm" disabled={removal.busy}>Supprimer</button>
									<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmId = null)}>Annuler</button>
									<ErrorAlert message={removal.error} />
								</form>
							{/if}
						{/if}
						<SiteManager {collection} />
						</li>
				{/each}
			</ul>
			<p class="text-base-content/60 text-xs">
				L'ordre est celui du menu de la liste. Pour supprimer une collection, déplacez ou supprimez d'abord ses
				fiches.
			</p>
		{/if}
	</div>
{/if}
