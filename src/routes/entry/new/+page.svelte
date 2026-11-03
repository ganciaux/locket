<script lang="ts">
	import EntryForm from '$lib/components/EntryForm.svelte';
	import Icon from '$lib/components/Icon.svelte';

	// Création à la suite : un formulaire neuf, dans la même collection.
	let next = $state(0);
	let collectionId = $state('');
	let lastSaved = $state('');
</script>

<a href="/" class="btn btn-ghost btn-sm mb-2 -ml-2"><Icon name="back" class="size-4" /> Mes fiches</a>
<h1 class="mb-4 text-2xl font-bold">Nouvelle fiche</h1>
{#if lastSaved}
	<p role="status" class="alert alert-success alert-soft mb-4">« {lastSaved} » enregistrée.</p>
{/if}
{#key next}
	<EntryForm
		cancelHref="/"
		initialCollectionId={collectionId}
		onnext={(saved) => {
			lastSaved = saved.name;
			collectionId = saved.collectionId;
			next++;
		}}
	/>
{/key}
