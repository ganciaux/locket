<script lang="ts">
	// En-tête des pages de la collection active (index, liens, tags, classement) : son menu à gauche,
	// actions propres à la page puis retour aux fiches à droite.
	import type { Snippet } from 'svelte';
	import CollectionSwitcher from '$lib/components/CollectionSwitcher.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { onselect, actions }: { onselect?: () => void; actions?: Snippet } = $props();
</script>

<div class="mb-4 flex items-center gap-2">
	<CollectionSwitcher {onselect} />
	{@render actions?.()}
	<!-- Libellé masqué sur téléphone : le nom de la collection doit rester lisible à 320 px. -->
	<a class="btn btn-ghost btn-sm shrink-0" href="/" aria-label="Mes fiches" title="Mes fiches">
		<Icon name="image" class="size-4" /><span class="hidden sm:inline">Mes fiches</span>
	</a>
</div>
