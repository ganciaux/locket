<script lang="ts">
	// Carte de fiche. Recherche (`onzoom`) : un clic l'agrandit. Index : un clic ouvre la fiche, ou la coche en
	// mode sélection.
	import CopyButton from '$lib/components/CopyButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LinkChips from '$lib/components/LinkChips.svelte';
	import ValidatedMark from '$lib/components/ValidatedMark.svelte';
	import { countryFlag, countryName, formatRating, framingClass } from '$lib/entries/model';
	import { type ListItem, entries } from '$lib/entries/store.svelte';
	import { prefs } from '$lib/prefs.svelte';

	let {
		entry,
		selecting = false,
		selected = false,
		onzoom,
		ontoggle,
		details = true
	}: {
		entry: ListItem;
		selecting?: boolean;
		selected?: boolean;
		/** Recherche : un clic agrandit la carte. Sans lui (index), un clic ouvre la fiche. */
		onzoom?: () => void;
		ontoggle?: () => void;
		/** Tags et liens selon les bascules de la recherche ; false (index) : jamais, la carte reste compacte. */
		details?: boolean;
	} = $props();

	const zooms = $derived(!!onzoom && !selecting);
	const links = $derived(entries.linksOf(entry));
	const entryTags = $derived(entries.tagsOf(entry));
	const rank = $derived(entries.rankOf(entry));
	// Bordure : couleur du tag de la catégorie de bordure (cadre `data-border`, app.css).
	const border = $derived(entries.borderOf(entry));
	// Couverture comprise : « 3 » pour une couverture et deux autres images.
	const imageCount = $derived(entry.gallery?.length ? entry.gallery.length + 1 : 0);
</script>

{#snippet cardName()}
	{#if entry.country}<span title={countryName(entry.country)}>{countryFlag(entry.country)}</span>{/if}
	<span class="min-w-0 flex-1 truncate">{entry.name}</span>
{/snippet}

<li
	id="card-{entry.id}"
	data-border={border}
	data-stack={imageCount > 2 ? '3' : imageCount === 2 ? '2' : undefined}
	class="card bg-base-100 relative overflow-hidden shadow-sm transition hover:shadow-md {entry.hidden
		? 'opacity-50 hover:opacity-100'
		: ''} {selected ? 'card-picked' : ''}"
>
	<!--
		Carte sélectionnée : inclinée, avec un reflet irisé (`card-picked`, app.css), plutôt qu'un cadre que l'on
		confondrait avec les bordures de catégorie.
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
						ontoggle?.();
					}}
				>
					{@render cardName()}
				</a>
			{/if}
			{#if entry.validatedAt}<ValidatedMark />{/if}
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
				<img src={entry.thumbUrl} alt="" class="size-full object-cover {framingClass(entry.framing)}" />
			{:else}
				<span class="text-primary font-bold {prefs.cardSize === 'small' ? 'text-3xl' : 'text-5xl'}" aria-hidden="true">
					{entry.name.charAt(0).toUpperCase()}
				</span>
			{/if}
			<!-- Note, rang et nombre d'images sur l'image pour ne pas ajouter de ligne ; translucides pour laisser voir la photo. -->
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
			{#if imageCount}
				<span class="badge badge-sm bg-base-100/70 absolute top-1 right-1 gap-0.5 border-0" role="img" aria-label="{imageCount} images">
					<Icon name="images" class="size-3" />{imageCount}
				</span>
			{/if}
			{#if selecting}
				<input
					type="checkbox"
					class="checkbox checkbox-sm bg-base-100 text-primary checked:border-primary absolute top-1 left-1 z-10"
					checked={selected}
					onchange={() => ontoggle?.()}
					aria-label="Sélectionner {entry.name}"
				/>
			{/if}
		</figure>
	</div>
	<!--
		Hors du lien de la carte : on ne peut pas imbriquer des éléments cliquables dans un <a>.
		Cartes d'une même ligne à la même hauteur (grille étirée) : les liens se calent en bas (mt-auto).
	-->
	{#if details && prefs.cardTags && entryTags.length}
		<div class="flex flex-wrap gap-1 px-3 py-2">
			{#each entryTags as tag (tag.id)}
				<span class="badge badge-soft badge-primary badge-xs">{tag.name}</span>
			{/each}
		</div>
	{/if}
	{#if details && prefs.cardLinks && links.length}
		<div class="border-base-200 mt-auto border-t px-3 py-2">
			<LinkChips {links} small />
		</div>
	{/if}
</li>
