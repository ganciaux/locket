<script lang="ts">
	import EntryForm from '$lib/components/EntryForm.svelte';

	// Création à la suite : un formulaire neuf, dans la même collection.
	let next = $state(0);
	let collectionId = $state('');
	let lastSaved = $state('');
</script>

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
