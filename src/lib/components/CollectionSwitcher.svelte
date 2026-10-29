<script lang="ts">
	// Bascule entre collections : le titre de la page ouvre le menu, dans l'ordre choisi par l'utilisateur.
	import Icon from '$lib/components/Icon.svelte';
	import { entries, selectCollection } from '$lib/entries/store.svelte';

	let { onselect }: { onselect?: () => void } = $props();

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
		<summary class="btn btn-ghost -ml-2 h-auto max-w-full list-none justify-start gap-2 px-2 py-1 [&::-webkit-details-marker]:hidden">
			<h1 class="min-w-0 truncate text-2xl font-bold">{entries.active.name}</h1>
			{#if entries.activeItems?.length}<span class="badge badge-primary badge-sm shrink-0">{entries.activeItems.length}</span>{/if}
			<Icon name="chevronDown" class="size-5 shrink-0 transition {open ? 'rotate-180' : ''}" />
		</summary>
		<ul class="dropdown-content menu bg-base-100 rounded-box z-20 mt-1 w-64 p-2 shadow-lg">
			{#each entries.collections as collection (collection.id)}
				{@const current = collection.id === entries.active.id}
				<li>
					<button class={current ? 'menu-active' : ''} aria-current={current} onclick={() => choose(collection.id)}>
						<span class="flex-1 truncate">{collection.name}</span>
						<span class="badge badge-ghost badge-sm">{entries.countIn(collection.id)}</span>
					</button>
				</li>
			{/each}
			<li class="border-base-200 mt-1 border-t pt-1">
				<a href="/collections" onclick={() => (open = false)}><Icon name="settings" class="size-4" /> Gérer les collections</a>
			</li>
		</ul>
	</details>
{/if}
