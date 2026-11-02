<script lang="ts">
	// Confirme le retrait d'une fiche du classement : sa place est perdue, il faudra refaire ses duels.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import { removeFromRanking } from '$lib/entries/ranking';
	import type { ListItem } from '$lib/entries/store.svelte';
	import { formAction } from '$lib/form.svelte';

	let { entry, onclose }: { entry: ListItem; onclose: () => void } = $props();

	const removal = formAction(async () => {
		await removeFromRanking(entry.collectionId, entry.id);
		onclose();
	});
</script>

<form class="alert alert-warning alert-soft flex flex-wrap items-center gap-2" onsubmit={removal.submit}>
	<span class="flex-1 text-sm">Retirer « {entry.name} » du classement ? Il faudra refaire ses duels pour la reclasser.</span>
	<button class="btn btn-warning btn-sm" disabled={removal.busy}>Retirer</button>
	<button type="button" class="btn btn-ghost btn-sm" onclick={onclose}>Annuler</button>
	<ErrorAlert message={removal.error} />
</form>
