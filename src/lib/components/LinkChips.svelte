<script lang="ts">
	// Liens d'une fiche en pastilles, pour la carte détaillée et le zoom ; la page de la fiche affiche aussi l'adresse.
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { type Link, linkTitle } from '$lib/entries/model';

	let { links, small = false }: { links: Link[]; small?: boolean } = $props();
</script>

<ul class="flex flex-wrap gap-1.5">
	{#each links as link, i (i)}
		<li class="max-w-full">
			<ExternalLink
				url={link.url}
				class="badge badge-soft badge-primary hover:badge-primary max-w-full gap-1 font-medium transition-colors {small
					? 'badge-sm'
					: ''}"
			>
				<span class="truncate">{linkTitle(link)}</span>
				<Icon name="external" class="size-3 shrink-0 opacity-70" />
			</ExternalLink>
		</li>
	{/each}
</ul>
