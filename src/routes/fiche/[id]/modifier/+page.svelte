<script lang="ts">
	import { page } from '$app/state';
	import EntryForm from '$lib/components/EntryForm.svelte';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	loadEntries().catch((e) => (error = errorMessage(e)));

	const entry = $derived(entries.find(page.params.id ?? ''));
</script>

<h1>Modifier la fiche</h1>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if !entries.items}
	<p>Déchiffrement…</p>
{:else if !entry}
	<p>Fiche introuvable.</p>
{:else}
	{#key entry.id}
		<EntryForm {entry} />
	{/key}
{/if}
<p><a href="/fiche/{page.params.id}">Annuler</a></p>
