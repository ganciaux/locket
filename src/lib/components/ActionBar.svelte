<script lang="ts">
	// Bandeau d'actions fixé en bas de l'écran, comme celui de la sélection (BulkToolbar) : les actions d'une page
	// longue (fiche, formulaire) restent à portée sans défiler. Le `pb-28` du <main> laisse la fin du contenu visible.
	import { dock } from '$lib/dock.svelte';
	import type { Snippet } from 'svelte';

	let { label, children }: { label: string; children: Snippet } = $props();
	// Hauteur suivie pour le bouton de retour en haut, remise à 0 quand le bandeau disparaît.
	$effect(() => () => (dock.height = 0));
</script>

<div
	bind:offsetHeight={dock.height}
	role="toolbar"
	aria-label={label}
	class="bg-base-100 fixed inset-x-0 bottom-0 z-20 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgb(0_0_0/0.15)]"
>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
		{@render children()}
	</div>
</div>
