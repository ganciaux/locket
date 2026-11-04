<script lang="ts">
	// Confirme le retrait d'une fiche du classement : sa place est perdue, il faudra refaire ses duels.
	import ConfirmInline from '$lib/components/ConfirmInline.svelte';
	import { removeFromRanking } from '$lib/entries/ranking';
	import type { ListItem } from '$lib/entries/store.svelte';

	let { entry, onclose }: { entry: ListItem; onclose: () => void } = $props();
</script>

<ConfirmInline
	tone="warning"
	confirmLabel="Retirer"
	message="Retirer « {entry.name} » du classement ? Il faudra refaire ses duels pour la reclasser."
	onconfirm={async () => (await removeFromRanking(entry.collectionId, entry.id), onclose())}
	oncancel={onclose}
/>
