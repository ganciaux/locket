<script lang="ts">
	// Carte de la liste. En mode sélection, un clic coche la fiche ; sinon il l'agrandit ou l'ouvre (Paramètres).
	import CopyButton from '$lib/components/CopyButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LinkChips from '$lib/components/LinkChips.svelte';
	import { countryFlag, countryName, formatRating } from '$lib/entries/model';
	import { type ListItem, entries } from '$lib/entries/store.svelte';
	import { prefs } from '$lib/prefs.svelte';

	let {
		entry,
		detailed,
		selecting,
		selected,
		onzoom,
		ontoggle
	}: {
		entry: ListItem;
		detailed: boolean;
		selecting: boolean;
		selected: boolean;
		onzoom: () => void;
		ontoggle: () => void;
	} = $props();

	const clickZooms = $derived(prefs.cardClick === 'zoom');
	const zooms = $derived(clickZooms && !selecting);
	const links = $derived(entries.linksOf(entry));
	const entryTags = $derived(entries.tagsOf(entry));
	const rank = $derived(entries.rankOf(entry));
</script>

{#snippet cardName()}
	{#if entry.country}<span title={countryName(entry.country)}>{countryFlag(entry.country)}</span>{/if}
	<span class="min-w-0 flex-1 truncate">{entry.name}</span>
{/snippet}

<li
	id="card-{entry.id}"
	class="card bg-base-100 relative overflow-hidden shadow-sm transition hover:shadow-md {entry.hidden
		? 'opacity-50 hover:opacity-100'
		: ''} {selected
		? 'after:border-primary after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border-2'
		: ''}"
>
	<!--
		Bordure de sélection en ::after du <li> : un outline passerait sous l'image.
		En-tête : le bouton (agrandir) ou le lien (ouvrir, cocher) porte le nom, et son ::after couvre toute la zone,
		image comprise. Le bouton de copie passe au-dessus : deux éléments cliquables ne peuvent pas s'imbriquer.
	-->
	<div class="relative">
		<h2
			class="flex items-center gap-1 font-semibold {prefs.cardSize === 'small'
				? 'py-1 pr-1 pl-2 text-xs'
				: prefs.cardSize === 'large'
					? 'py-2 pr-3 pl-4 text-base'
					: 'py-1.5 pr-2 pl-3 text-sm'}"
		>
			{#if zooms}
				<button
					type="button"
					class="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left after:absolute after:inset-0 after:z-[1]"
					aria-haspopup="dialog"
					onclick={onzoom}
				>
					{@render cardName()}
				</button>
			{:else}
				<a
					href="/entry/{entry.id}"
					class="flex min-w-0 flex-1 items-center gap-1 after:absolute after:inset-0 after:z-[1]"
					onclick={(event) => {
						if (!selecting) return;
						event.preventDefault();
						ontoggle();
					}}
				>
					{@render cardName()}
				</a>
			{/if}
			{#if !selecting}
				<CopyButton
					text={entry.name}
					label="Copier le nom de {entry.name}"
					class="btn btn-ghost btn-xs btn-square text-base-content/50 relative z-10 shrink-0"
				/>
			{/if}
		</h2>
		<figure class="bg-primary/10 relative aspect-square">
			{#if entry.thumbUrl}
				<img src={entry.thumbUrl} alt="" class="size-full object-cover" />
			{:else}
				<span class="text-primary font-bold {prefs.cardSize === 'small' ? 'text-3xl' : 'text-5xl'}" aria-hidden="true">
					{entry.name.charAt(0).toUpperCase()}
				</span>
			{/if}
			<!-- Note et rang sur l'image pour ne pas ajouter de ligne ; translucides pour laisser voir la photo. -->
			{#if entry.rating}
				<span class="badge badge-sm bg-base-100/70 absolute bottom-1 left-1 border-0" role="img" aria-label="Note : {formatRating(entry.rating)} sur 5">
					★ {formatRating(entry.rating)}
				</span>
			{/if}
			{#if rank}
				<span class="badge badge-sm bg-neutral/70 text-neutral-content absolute right-1 bottom-1 border-0" title="Rang dans le classement">
					#{rank}
				</span>
			{/if}
			{#if selecting}
				<input
					type="checkbox"
					class="checkbox checkbox-sm bg-base-100 text-primary checked:border-primary absolute top-1 left-1 z-10"
					checked={selected}
					onchange={ontoggle}
					aria-label="Sélectionner {entry.name}"
				/>
			{/if}
		</figure>
	</div>
	{#if (!clickZooms || selecting) && !detailed && (entryTags.length || links.length)}
		<button
			type="button"
			class="text-base-content/60 hover:bg-base-200 border-base-200 flex w-full cursor-pointer items-center gap-1 border-t px-3 py-1.5 text-xs"
			aria-haspopup="dialog"
			onclick={onzoom}
		>
			<span class="flex-1 text-left">Détails</span>
			<Icon name="chevronRight" class="size-4" />
		</button>
	{/if}

	<!-- Hors du lien de la carte : on ne peut pas imbriquer des éléments cliquables dans un <a>. -->
	{#if detailed}
		{#if entryTags.length}
			<div class="flex flex-wrap gap-1 px-3 py-2">
				{#each entryTags as tag (tag.id)}
					<span class="badge badge-soft badge-primary badge-xs">{tag.name}</span>
				{/each}
			</div>
		{/if}
		{#if links.length}
			<div class="border-base-200 border-t px-3 py-2">
				<LinkChips {links} small />
			</div>
		{/if}
	{/if}
</li>
