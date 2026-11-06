<script lang="ts">
	// Bascule entre collections : le titre de la page ouvre le menu, dans l'ordre choisi par l'utilisateur.
	import Icon from '$lib/components/Icon.svelte';
	import { selectCollection } from '$lib/entries/collections';
	import { entries } from '$lib/entries/store.svelte';
	import { prefs } from '$lib/prefs.svelte';

	let { onselect }: { onselect?: () => void } = $props();

	const PAGES = [
		{ href: '/', icon: 'search', label: 'Chercher des fiches' },
		{ href: '/list', icon: 'list', label: 'Index de la collection' },
		{ href: '/album', icon: 'album', label: 'Album de la collection' },
		{ href: '/sites', icon: 'link', label: 'Gérer les liens' },
		{ href: '/tags', icon: 'tag', label: 'Gérer les tags' },
		{ href: '/ranking', icon: 'podium', label: 'Gérer le classement' },
		{ href: '/stats', icon: 'chart', label: 'Statistiques' }
	] as const;

	let open = $state(false);
	let menu: HTMLDetailsElement | undefined = $state();

	function choose(id: string) {
		open = false;
		if (id === entries.active?.id) return;
		selectCollection(id);
		onselect?.();
	}

	// <details> ne se ferme pas tout seul : clic à l'extérieur ou Échap.
	function closeOutside(event: MouseEvent) {
		if (open && !menu?.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window onclick={closeOutside} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#if entries.active && entries.collections}
	<!-- flex-1 : le titre prend la place disponible et ne se tronque que s'il est vraiment trop long. -->
	<details class="dropdown min-w-0 flex-1" bind:open bind:this={menu}>
		<summary class="btn btn-ghost -ml-2 h-auto max-w-full list-none items-center justify-start gap-2 px-2 py-1 [&::-webkit-details-marker]:hidden">
			<h1 class="min-w-0 truncate text-2xl font-bold">{entries.active.name}</h1>
			<!-- Chiffres sans jambage : pas de décalage vers le haut (app.css) ; descendu de 1,5 px pour se centrer
			     sur les majuscules du titre plutôt que sur sa ligne (mesuré avec Segoe UI). -->
			{#if entries.activeItems?.length}<span class="badge badge-primary badge-sm shrink-0 translate-y-[1.5px] pb-0">{entries.activeItems.length}</span>{/if}
			<Icon name="chevronDown" class="size-5 shrink-0 transition {open ? 'rotate-180' : ''}" />
		</summary>
		<ul class="dropdown-content menu bg-base-100 rounded-box z-20 mt-1 w-64 p-2 shadow-lg">
			{#each entries.shownCollections ?? [] as collection (collection.id)}
				{@const current = collection.id === entries.active.id}
				<li>
					<button class={current ? 'menu-active' : ''} aria-current={current} onclick={() => choose(collection.id)}>
						<span class="flex-1 truncate">{collection.name}</span>
						<span class="badge badge-ghost badge-sm pb-0">{entries.countIn(collection.id)}</span>
					</button>
				</li>
			{/each}
			<!-- Même préférence que pour les fiches cachées : une seule notion de discrétion. -->
			{#if entries.hiddenCollectionCount}
				<li>
					<button class="text-base-content/60 text-xs" aria-pressed={prefs.showHidden} onclick={() => (prefs.showHidden = !prefs.showHidden)}>
						{prefs.showHidden ? 'Masquer' : 'Afficher'} les cachées ({entries.hiddenCollectionCount})
					</button>
				</li>
			{/if}
			<!-- Pages de la collection active ; « Gérer les collections » reste dans les paramètres. -->
			{#each PAGES as item, i (item.href)}
				<li class={i === 0 ? 'border-base-200 mt-1 border-t pt-1' : ''}>
					<a href={item.href} onclick={() => (open = false)}><Icon name={item.icon} class="size-4" /> {item.label}</a>
				</li>
			{/each}
		</ul>
	</details>
{/if}
