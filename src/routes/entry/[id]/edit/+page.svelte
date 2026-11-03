<script lang="ts">
	import { page } from '$app/state';
	import EntryForm from '$lib/components/EntryForm.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	loadEntries().catch((e) => (error = errorMessage(e)));

	const id = $derived(page.params.id ?? '');
	const entry = $derived(entries.find(id));
</script>

<a href="/" class="btn btn-ghost btn-sm mb-2 -ml-2"><Icon name="back" class="size-4" /> Mes fiches</a>
<h1 class="mb-4 text-2xl font-bold">Modifier la fiche</h1>

<ErrorAlert message={error} />
{#if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.items && !entry}
	<p class="alert alert-warning alert-soft">Fiche introuvable.</p>
{:else if entry}
	{#key entry.id}
		<EntryForm {entry} cancelHref="/entry/{id}" />
	{/key}
{/if}
