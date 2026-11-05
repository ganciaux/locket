<script lang="ts">
	// Actions sur la sélection multiple, limitée aux fiches affichées (`items`). Reste ouverte après chaque action.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { TRASH_DAYS, notValidated } from '$lib/entries/model';
	import {
		type ListItem,
		changeEntriesSites,
		changeEntriesTags,
		deleteForever,
		entries,
		setEntriesHidden,
		setEntriesValidated,
		trashEntries
	} from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let {
		items,
		selected = $bindable(),
		onclose
	}: { items: ListItem[]; selected: string[]; onclose: () => void } = $props();

	let panel = $state<'tags' | 'sites' | 'trash' | null>(null);
	let tagIds = $state<string[]>([]);
	let siteIds = $state<string[]>([]);
	let busy = $state(false);
	let error = $state('');
	// Sites de la collection, au format attendu par TagPicker.
	const siteChoices = $derived(
		entries.active
			? entries.sitesIn(entries.active.id).map((site) => ({ id: site.id, name: site.label, collectionId: site.id }))
			: []
	);
	const selectedItems = $derived(items.filter((entry) => selected.includes(entry.id)));
	// Les fiches validées sont laissées de côté par les actions qui modifient (tout sauf valider).
	const editable = $derived(notValidated(selectedItems));
	const skipped = $derived(selectedItems.length - editable.length);
	const allHidden = $derived(editable.length > 0 && editable.every((entry) => entry.hidden));
	const allValidated = $derived(selectedItems.length > 0 && skipped === selectedItems.length);
	const allSelected = $derived(items.length > 0 && selectedItems.length === items.length);

	// « Tout » est une bascule : tout sélectionner, puis tout désélectionner.
	function toggleAll() {
		selected = allSelected ? [] : items.map((entry) => entry.id);
	}

	function closePanel() {
		panel = null;
		tagIds = [];
		siteIds = [];
	}

	async function apply(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await action();
			// La sélection reste ouverte pour enchaîner ; seules les fiches encore affichées restent cochées.
			closePanel();
			selected = selected.filter((id) => items.some((entry) => entry.id === id));
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<div
	role="toolbar"
	aria-label="Actions sur la sélection"
	class="bg-base-100 fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.15)]"
>
	<ErrorAlert message={error} />
	{#if skipped}
		<p class="mx-auto flex w-full max-w-3xl items-center gap-1 text-xs opacity-70" role="status">
			<Icon name="validated" class="size-3" />
			{skipped} validée{skipped > 1 ? 's' : ''} laissée{skipped > 1 ? 's' : ''} de côté
		</p>
	{/if}
	{#if panel === 'tags'}
		<TagPicker
			tags={entries.tags ?? []}
			groups={entries.tagGroups}
			bind:selected={tagIds}
			label="Tags à ajouter, retirer ou définir"
			single
		/>
		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-primary btn-sm"
				disabled={busy || !tagIds.length}
				onclick={() => apply(() => changeEntriesTags(editable, tagIds, 'add'))}
			>
				Ajouter
			</button>
			<button
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy || !tagIds.length}
				onclick={() => apply(() => changeEntriesTags(editable, tagIds, 'remove'))}
			>
				Retirer
			</button>
			<button
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy}
				title="Les fiches auront exactement ces tags"
				onclick={() => apply(() => changeEntriesTags(editable, tagIds, 'set'))}
			>
				{tagIds.length ? 'Définir' : 'Retirer tous'}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={closePanel}>Retour</button>
		</div>
	{:else if panel === 'sites'}
		<p class="text-sm">Sites de la collection à afficher ou masquer sur les fiches sélectionnées ; « Définir » n'affiche que ceux-là :</p>
		<TagPicker tags={siteChoices} bind:selected={siteIds} label="Sites à afficher, masquer ou définir" />
		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-primary btn-sm"
				disabled={busy || !siteIds.length}
				onclick={() => apply(() => changeEntriesSites(editable, siteIds, 'show'))}
			>
				Afficher
			</button>
			<button
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy || !siteIds.length}
				onclick={() => apply(() => changeEntriesSites(editable, siteIds, 'hide'))}
			>
				Masquer
			</button>
			<button
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy}
				title="Seuls ces sites restent affichés"
				onclick={() => apply(() => changeEntriesSites(editable, siteIds, 'set'))}
			>
				{siteIds.length ? 'Définir' : 'Masquer tous'}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={closePanel}>Retour</button>
		</div>
	{:else if panel === 'trash'}
		{@const count = editable.length}
		<p class="text-sm">
			Supprimer {count} fiche{count > 1 ? 's' : ''} ? La corbeille les garde {TRASH_DAYS} jours ; la suppression définitive
			est irréversible.
		</p>
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-error btn-sm" disabled={busy} onclick={() => apply(() => trashEntries(editable))}>
				Mettre à la corbeille
			</button>
			<button class="btn btn-error btn-outline btn-sm" disabled={busy} onclick={() => apply(() => deleteForever(editable))}>
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
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy || !selectedItems.length}
				title={allValidated ? 'Retirer la validation des fiches sélectionnées' : 'Valider les fiches sélectionnées'}
				onclick={() => apply(() => (allValidated ? setEntriesValidated(selectedItems, false) : setEntriesValidated(editable, true)))}
			>
				<Icon name="validated" class="size-4" />
				{allValidated ? 'Dévalider' : 'Valider'}
			</button>
			<button
				class="btn btn-outline btn-primary btn-sm"
				disabled={busy || !editable.length}
				onclick={() => apply(() => setEntriesHidden(editable, !allHidden))}
			>
				{allHidden ? 'Afficher' : 'Cacher'}
			</button>
			{#if entries.tags?.length}
				<button class="btn btn-outline btn-primary btn-sm" disabled={!editable.length} onclick={() => (panel = 'tags')}>Tags</button>
			{/if}
			{#if siteChoices.length}
				<button class="btn btn-outline btn-primary btn-sm" disabled={!editable.length} onclick={() => (panel = 'sites')}>Liens</button>
			{/if}
			<button class="btn btn-sm btn-error btn-outline" disabled={!editable.length} onclick={() => (panel = 'trash')}>
				Supprimer
			</button>
			<button class="btn btn-ghost btn-sm btn-square ml-auto" onclick={onclose} aria-label="Quitter la sélection" title="Quitter">
				<Icon name="close" class="size-4" />
			</button>
		</div>
	{/if}
</div>
