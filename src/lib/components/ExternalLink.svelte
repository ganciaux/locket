<script lang="ts">
	// Lien vers un site tiers : URL revalidée à l'affichage (http(s) seulement), ouverture selon la préférence.
	import type { Snippet } from 'svelte';
	import { parseLinkUrl } from '$lib/entries/model';
	import { prefs } from '$lib/prefs.svelte';

	let { url, children }: { url: string; children: Snippet } = $props();
	const href = $derived(parseLinkUrl(url));
</script>

{#if href}
	<a
		{href}
		target={prefs.linksInNewTab ? '_blank' : undefined}
		rel="noopener noreferrer">{@render children()}</a
	>
{:else}
	<span>{@render children()}</span>
{/if}
