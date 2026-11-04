<script lang="ts">
	import { page } from '$app/state';
	import EntryForm from '$lib/components/EntryForm.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import { entryNav } from '$lib/entries/entryNav.svelte';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	loadEntries().catch((e) => (error = errorMessage(e)));

	const id = $derived(page.params.id ?? '');
	const entry = $derived(entries.find(id));

	// Retour vers la liste d'origine (index, classement…), comme sur la fiche (voir entryNav).
	const origin = $derived(entryNav.current?.ids.includes(id) ? entryNav.current : null);
	const backHref = $derived(origin?.backHref ?? '/');
	const backLabel = $derived(origin?.backLabel ?? 'Mes fiches');
	// Ouverte directement depuis une liste (`?from=list`) : Annuler et Enregistrer y ramènent, sans passer par la fiche.
	const direct = $derived(!!origin && page.url.searchParams.get('from') === 'list');
</script>

<a href={backHref} class="btn btn-ghost btn-sm mb-2 -ml-2"><Icon name="back" class="size-4" /> {backLabel}</a>
<h1 class="mb-4 text-2xl font-bold">Modifier la fiche</h1>

<ErrorAlert message={error} />
{#if !error && !entries.items}
	<PageSpinner />
{:else if entries.items && !entry}
	<p class="alert alert-warning alert-soft">Fiche introuvable.</p>
{:else if entry}
	{#key entry.id}
		<EntryForm {entry} cancelHref={direct ? backHref : `/entry/${id}`} doneHref={direct ? backHref : undefined} />
	{/key}
{/if}
