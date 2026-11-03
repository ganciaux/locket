<script lang="ts">
	// Catégories de tags d'une collection : ajout, renommage, ordre et suppression (ses tags restent, sans catégorie).
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { type FilterLevel, MAX_LABEL_LENGTH, filterLevel } from '$lib/entries/model';
	import { addTagGroup, deleteTagGroup, moveTagGroup, renameTagGroup, setTagGroupFilter } from '$lib/entries/collections';
	import { entries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let { collectionId }: { collectionId: string } = $props();

	const LEVELS: { value: FilterLevel; label: string }[] = [
		{ value: 'simple', label: 'Recherche simple' },
		{ value: 'advanced', label: 'Recherche avancée' },
		{ value: 'off', label: 'Hors filtre' }
	];

	const groups = $derived(entries.tagGroupsIn(collectionId));
	const countIn = (groupId: string) => entries.tagsIn(collectionId).filter((tag) => tag.groupId === groupId).length;

	let name = $state('');
	let editId = $state<string | null>(null);
	let editName = $state('');
	let confirmId = $state<string | null>(null);
	let error = $state('');

	const addForm = formAction(async () => {
		await addTagGroup(collectionId, name);
		name = '';
	});

	const rename = formAction(async () => {
		if (editId) await renameTagGroup(collectionId, editId, editName);
		editId = null;
	});

	function startEdit(id: string, current: string) {
		confirmId = null;
		editId = id;
		editName = current;
	}

	async function run(action: () => Promise<void>) {
		error = '';
		try {
			await action();
		} catch (e) {
			error = errorMessage(e);
		}
	}
</script>

<!-- Repliées par défaut : réglées une fois, elles ne doivent pas pousser la liste des tags vers le bas. -->
<details class="card bg-base-100 group shadow-sm">
	<summary class="card-body flex-row cursor-pointer list-none items-center gap-2 py-4 [&::-webkit-details-marker]:hidden">
		<Icon name="list" class="size-5" />
		<h2 class="flex-1 font-semibold">Catégories ({groups.length})</h2>
		<Icon name="chevronDown" class="size-4 transition group-open:rotate-180" />
	</summary>
	<div class="card-body gap-3 pt-0">
		<p class="text-base-content/60 text-xs">
			Rangent les tags (Genre, Statut…) dans le choix des tags, le filtre et les fiches. Dans le filtre de la liste, une
			catégorie est proposée d'emblée (recherche simple), avec le bouton « Recherche avancée », ou jamais.
		</p>
		<form class="join w-full" onsubmit={addForm.submit}>
			<input
				class="input input-sm join-item w-full"
				placeholder="Nouvelle catégorie"
				aria-label="Nouvelle catégorie"
				maxlength={MAX_LABEL_LENGTH}
				bind:value={name}
				required
			/>
			<button class="btn btn-primary btn-sm join-item" disabled={addForm.busy} aria-label="Ajouter la catégorie">
				<Icon name="plus" class="size-4" /> Ajouter
			</button>
		</form>
		<ErrorAlert message={addForm.error || error} />

		{#each groups as group, i (group.id)}
			{@const count = countIn(group.id)}
			<div class="bg-base-200 rounded-box flex flex-col gap-2 p-2">
				{#if editId === group.id}
					<form class="join w-full" onsubmit={rename.submit}>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="input input-sm join-item w-full"
							aria-label="Nouveau nom de la catégorie"
							maxlength={MAX_LABEL_LENGTH}
							bind:value={editName}
							required
							autofocus
						/>
						<button class="btn btn-primary btn-sm join-item" disabled={rename.busy}>Renommer</button>
						<button type="button" class="btn btn-ghost btn-sm join-item" onclick={() => (editId = null)}>Annuler</button>
					</form>
					<ErrorAlert message={rename.error} />
				{:else}
					<div class="flex items-center gap-2">
						<div class="flex flex-col">
							<button
								class="btn btn-ghost btn-xs btn-square"
								disabled={i === 0}
								onclick={() => run(() => moveTagGroup(collectionId, group.id, -1))}
								aria-label="Monter {group.name}"
								title="Monter"
							>
								<Icon name="chevronUp" class="size-4" />
							</button>
							<button
								class="btn btn-ghost btn-xs btn-square"
								disabled={i === groups.length - 1}
								onclick={() => run(() => moveTagGroup(collectionId, group.id, 1))}
								aria-label="Descendre {group.name}"
								title="Descendre"
							>
								<Icon name="chevronDown" class="size-4" />
							</button>
						</div>
						<span class="flex-1 font-medium break-all">{group.name}</span>
						<span class="text-base-content/60 text-xs">{count} tag{count > 1 ? 's' : ''}</span>
						{#if confirmId !== group.id}
							<button
								class="btn btn-ghost btn-sm btn-square"
								onclick={() => startEdit(group.id, group.name)}
								aria-label="Renommer la catégorie {group.name}"
								title="Renommer"
							>
								<Icon name="edit" class="size-4" />
							</button>
							<button
								class="btn btn-ghost btn-sm btn-square text-error"
								onclick={() => ((confirmId = group.id), (editId = null))}
								aria-label="Supprimer la catégorie {group.name}"
								title="Supprimer"
							>
								<Icon name="trash" class="size-4" />
							</button>
						{/if}
					</div>
					<select
						class="select select-xs w-auto self-end"
						aria-label="Filtre de la catégorie {group.name}"
						value={filterLevel(group)}
						onchange={(e) => run(() => setTagGroupFilter(collectionId, group.id, e.currentTarget.value as FilterLevel))}
					>
						{#each LEVELS as level (level.value)}
							<option value={level.value}>{level.label}</option>
						{/each}
					</select>
					{#if confirmId === group.id}
						<div class="alert alert-error alert-soft flex flex-wrap items-center gap-2">
							<span class="flex-1 text-sm">
								Supprimer « {group.name} » ?{count ? ` Ses ${count} tag${count > 1 ? 's' : ''} resteront, sans catégorie.` : ''}
							</span>
							<button
								class="btn btn-error btn-sm"
								onclick={() => run(() => deleteTagGroup(collectionId, group.id)).then(() => (confirmId = null))}
							>
								Supprimer
							</button>
							<button class="btn btn-ghost btn-sm" onclick={() => (confirmId = null)}>Annuler</button>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
</details>
