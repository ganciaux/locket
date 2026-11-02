<script lang="ts">
	// Fiche agrandie au-dessus de la liste, qui reste visible derrière. Un clic hors des boutons et des liens la referme.
	// Animée par l'API Web Animations : la CSP interdit les styles en ligne, donc les transitions Svelte.
	import { onMount } from 'svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import { countryFlag, countryName, linkTitle, neighbours } from '$lib/entries/model';
	import { findSimilar } from '$lib/entries/similar';
	import { type ListItem, entries, rateEntry } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { swipe } from '$lib/swipe';

	const DURATION_MS = 220;

	let {
		id,
		ids,
		onchange,
		onclose
	}: { id: string; ids: string[]; onchange: (id: string) => void; onclose: () => void } = $props();

	let dialog = $state<HTMLDialogElement>();
	let box = $state<HTMLElement>();
	let closing = false;
	let error = $state('');
	let savingRating = $state(false);

	const entry = $derived(entries.find(id));
	// Ressemblantes affichées : les flèches parcourent la fiche de départ et cette liste, plus les résultats.
	let similar = $state.raw<{ sourceId: string; items: ListItem[] } | null>(null);
	let searching = $state(false);
	const navIds = $derived(similar ? [similar.sourceId, ...similar.items.map((item) => item.id)] : ids);
	const position = $derived(neighbours(navIds, id));

	async function toggleSimilar() {
		if (similar) {
			similar = null;
			return;
		}
		if (!entry || searching) return;
		searching = true;
		error = '';
		try {
			similar = { sourceId: entry.id, items: await findSimilar(entry, entries.siblings(entry)) };
		} catch (e) {
			error = errorMessage(e);
		} finally {
			searching = false;
		}
	}

	/** Position de la carte dans la liste, exprimée par rapport à la fiche agrandie. */
	function cardFrame(): Keyframe | null {
		const card = document.getElementById(`card-${id}`)?.querySelector('figure')?.getBoundingClientRect();
		const zoomed = box?.getBoundingClientRect();
		if (!card || !zoomed || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
		const dx = card.left + card.width / 2 - (zoomed.left + zoomed.width / 2);
		const dy = card.top + card.height / 2 - (zoomed.top + zoomed.height / 2);
		return { transform: `translate(${dx}px, ${dy}px) scale(${card.width / zoomed.width})`, opacity: 0.3 };
	}

	const zoomedFrame: Keyframe = { transform: 'none', opacity: 1 };

	onMount(() => {
		dialog?.showModal();
		// Sinon le navigateur focalise le premier bouton, celui de copie, et l'entoure.
		box?.focus();
		const frame = cardFrame();
		if (frame) box?.animate([frame, zoomedFrame], { duration: DURATION_MS, easing: 'ease-out' });
	});

	async function close() {
		if (closing) return;
		closing = true;
		// La fiche affichée n'est peut-être plus celle du départ : sa carte doit être à l'écran.
		document.getElementById(`card-${id}`)?.scrollIntoView({ block: 'nearest' });
		const frame = cardFrame();
		if (frame) await box?.animate([zoomedFrame, frame], { duration: DURATION_MS, easing: 'ease-in', fill: 'forwards' }).finished;
		onclose();
	}

	const show = (other: string | undefined) => other && onchange(other);

	function onClick(event: MouseEvent) {
		if (event.target instanceof Element && !event.target.closest('a, button, input, label')) close();
	}

	function onKeydown(event: KeyboardEvent) {
		// Dans les étoiles, les flèches changent la note.
		if (event.target instanceof HTMLInputElement) return;
		if (event.key === 'ArrowLeft') show(position?.previous);
		if (event.key === 'ArrowRight') show(position?.next);
	}

	async function rate(value: number | undefined) {
		if (!entry || savingRating) return;
		savingRating = true;
		error = '';
		try {
			await rateEntry(entry, value);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			savingRating = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="modal bg-black/60"
	aria-label={entry?.name}
	onclick={onClick}
	onkeydown={onKeydown}
	use:swipe={{ onleft: () => show(position?.next), onright: () => show(position?.previous) }}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
>
	{#if entry}
		{@const links = entries.linksOf(entry)}
		{@const tags = entries.tagsOf(entry)}
		{@const rank = entries.rankOf(entry)}
		<div
			bind:this={box}
			class="modal-box flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md flex-col overflow-y-auto overscroll-contain p-0 outline-none"
			tabindex="-1"
		>
			<header class="flex items-center gap-2 px-4 py-2">
				{#if entry.country}<span title={countryName(entry.country)}>{countryFlag(entry.country)}</span>{/if}
				<h2 class="min-w-0 flex-1 text-lg font-bold break-words">{entry.name}</h2>
				<CopyButton text={entry.name} label="Copier le nom" class="btn btn-ghost btn-sm btn-square shrink-0" />
				<button class="btn btn-ghost btn-sm btn-square shrink-0" aria-label="Fermer" onclick={close}>
					<Icon name="close" class="size-4" />
				</button>
			</header>

			<figure class="bg-base-200 relative flex min-h-40 items-center justify-center">
				{#if entry.thumbUrl}
					<img src={entry.thumbUrl} alt="" class="max-h-[45dvh] w-full object-contain" />
				{:else}
					<span class="text-primary text-7xl font-bold" aria-hidden="true">{entry.name.charAt(0).toUpperCase()}</span>
				{/if}
				{#if position && position.count > 1}
					<button
						class="btn btn-circle btn-sm bg-base-100/80 absolute top-1/2 left-2 -translate-y-1/2"
						disabled={!position.previous}
						aria-label="Fiche précédente"
						onclick={() => show(position.previous)}
					>
						<Icon name="back" class="size-4" />
					</button>
					<button
						class="btn btn-circle btn-sm bg-base-100/80 absolute top-1/2 right-2 -translate-y-1/2"
						disabled={!position.next}
						aria-label="Fiche suivante"
						onclick={() => show(position.next)}
					>
						<Icon name="forward" class="size-4" />
					</button>
					<span class="badge badge-sm bg-base-100/70 absolute bottom-1 left-1/2 -translate-x-1/2 border-0" role="status">
						{position.position} / {position.count}
					</span>
				{/if}
			</figure>

			<div class="flex flex-col gap-3 p-4">
				<ErrorAlert message={error} />
				<div class="flex items-center gap-2">
					<Rating value={entry.rating} onchange={rate} disabled={savingRating} />
					{#if rank}<span class="badge badge-neutral ml-auto" title="Rang dans le classement">#{rank}</span>{/if}
				</div>
				{#if tags.length}
					<div class="flex flex-wrap gap-1">
						{#each tags as tag (tag.id)}
							<span class="badge badge-soft badge-primary badge-sm">{tag.name}</span>
						{/each}
					</div>
				{/if}
				{#if links.length}
					<ul class="flex flex-col gap-1 text-sm">
						{#each links as link, i (i)}
							<li class="truncate"><ExternalLink url={link.url}>{linkTitle(link)}</ExternalLink></li>
						{/each}
					</ul>
				{/if}
				<div class="grid grid-cols-3 gap-2">
					<a class="btn btn-primary btn-sm" href="/entry/{entry.id}" aria-label="Ouvrir la fiche">Ouvrir</a>
					<a class="btn btn-outline btn-primary btn-sm" href="/entry/{entry.id}/edit" aria-label="Modifier la fiche">Modifier</a>
					<button class="btn btn-outline btn-primary btn-sm" aria-pressed={!!similar} disabled={searching} onclick={toggleSimilar}>
						{#if searching}<span class="loading loading-spinner loading-xs"></span>{:else}Similaires{/if}
					</button>
				</div>
				{#if similar}
					{#if similar.items.length}
						<ul class="flex gap-2 overflow-x-auto pb-1" data-no-swipe>
							{#each similar.items as item (item.id)}
								<li class="shrink-0">
									<button
										class="bg-primary/10 rounded-box flex size-16 cursor-pointer items-center justify-center overflow-hidden {item.id === id
											? 'outline-primary outline-2'
											: ''}"
										aria-label="Voir {item.name}"
										title={item.name}
										onclick={() => onchange(item.id)}
									>
										{#if item.thumbUrl}
											<img src={item.thumbUrl} alt="" class="size-full object-cover" />
										{:else}
											<span class="text-primary font-bold" aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-base-content/60 text-sm">Aucune fiche assez proche dans cette collection.</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</dialog>
