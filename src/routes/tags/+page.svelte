<script lang="ts">
	// Administration des tags de la collection active : ajout, renommage et suppression.
	// Le catalogue est chiffré comme les fiches.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { MAX_LABEL_LENGTH } from '$lib/entries/model';
	import { addTag, deleteTag, entries, loadEntries, renameTag, selectCollection } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let name = $state('');
	let error = $state('');
	let confirmId = $state<string | null>(null);
	let editId = $state<string | null>(null);
	let editName = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const addForm = formAction(async () => {
		await addTag(name);
		name = '';
	});

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

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-2 text-2xl font-bold">Tags</h1>

<ErrorAlert message={error} />

{#if !error && !entries.collections}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if !entries.active}
	<p class="text-base-content/60 py-8 text-center">
		Les tags sont propres à chaque collection. <a class="link link-primary" href="/collections">Créez d'abord une collection</a>.
	</p>
{:else if entries.tags && entries.collections}
	<label class="text-base-content/70 mb-4 flex items-center gap-2 text-sm">
		Collection
		<select
			class="select select-sm w-auto"
			value={entries.active.id}
			onchange={(e) => ((editId = confirmId = null), selectCollection(e.currentTarget.value))}
		>
			{#each entries.collections as collection (collection.id)}
				<option value={collection.id}>{collection.name}</option>
			{/each}
		</select>
	</label>
	<div class="flex flex-col gap-4">
		<form class="card bg-base-100 shadow-sm" onsubmit={addForm.submit}>
			<div class="card-body gap-3">
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
			<ul class="card bg-base-100 divide-base-200 divide-y shadow-sm">
				{#each entries.tags as tag (tag.id)}
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
							<div class="flex items-center gap-3">
								<Icon name="tag" class="text-primary size-4" />
								<span class="flex-1 font-medium break-all">{tag.name}</span>
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
		{/if}
	</div>
{/if}
