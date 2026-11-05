<script lang="ts">
	// Fiche validée : coche pâle juste avant le bouton copier (carte, zoom, fiche), au même endroit d'une fiche à l'autre.
	import Icon from '$lib/components/Icon.svelte';

	/** `class` : hauteur du bouton copier voisin quand la ligne s'aligne en haut (titre sur plusieurs lignes). */
	let { class: className = '' }: { class?: string } = $props();
</script>

<span class="text-base-content/40 flex shrink-0 items-center {className}" role="img" aria-label="Validée" title="Validée">
	<Icon name="check" class="size-4" />
</span>
