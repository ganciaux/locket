<script lang="ts">
	// Bouton flottant « Nouvelle fiche », sur la liste (sur une fiche, il est dans le bandeau d'actions).
	import Icon from '$lib/components/Icon.svelte';
</script>

<a
	href="/entry/new"
	class="btn btn-primary btn-circle btn-lg fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg"
	aria-label="Nouvelle fiche"
	title="Nouvelle fiche"
>
	<Icon name="plus" class="size-7" />
</a>
