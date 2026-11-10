<script lang="ts">
	// Fiche agrandie au-dessus de la liste, qui reste visible derrière. Un clic hors des boutons et des liens la referme.
	// Animée par l'API Web Animations : la CSP interdit les styles en ligne, donc les transitions Svelte.
	import { onMount, tick, untrack } from 'svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ImageCarousel from '$lib/components/ImageCarousel.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import LinkChips from '$lib/components/LinkChips.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import ValidatedMark from '$lib/components/ValidatedMark.svelte';
	import { countryFlag, countryName, formatAge, framingClass, neighbours } from '$lib/entries/model';
	import { type Criterion, type Similarity, findSimilar } from '$lib/entries/similar';
	import { type ListItem, entries, rateEntry } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { prefs } from '$lib/prefs.svelte';
	import { playReveal } from '$lib/reveal';
	import { swipe } from '$lib/swipe';

	const DURATION_MS = 220;
	const CRITERIA: { key: Criterion; label: string }[] = [
		{ key: 'image', label: 'image' },
		{ key: 'tags', label: 'tags' },
		{ key: 'name', label: 'nom' },
		{ key: 'country', label: 'pays' }
	];
	const percent = (value: number) => `${Math.round(value * 100)} %`;

	let {
		id,
		ids,
		draw = 0,
		readonly = false,
		onchange,
		onclose,
		onreroll
	}: {
		id: string;
		ids: string[];
		/** Numéro du tirage au hasard (dé) : chaque nouveau numéro joue la révélation de la carte. */
		draw?: number;
		/** Album : on regarde seulement (ni ouvrir, ni modifier, ni similaires ; note figée). */
		readonly?: boolean;
		onchange: (id: string) => void;
		onclose: () => void;
		/** Après un tirage : bouton dé pour en refaire un. */
		onreroll?: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let image = $state<HTMLElement>();
	let title = $state<HTMLElement>();

	// Après le rendu de la fiche tirée : son image est en place.
	$effect(() => {
		if (!draw) return;
		untrack(() =>
			tick().then(() => image && playReveal(image, title, { mode: prefs.revealMode, random: prefs.revealRandom, duration: prefs.revealMs }))
		);
	});
	let box = $state<HTMLElement>();
	let closing = false;
	let error = $state('');
	let savingRating = $state(false);

	const entry = $derived(entries.find(id));
	// Ressemblantes de la fiche de départ. En aperçu de l'une d'elles, les flèches ne parcourent que les ressemblantes
	// et fermer ramène à la fiche de départ ; sur celle-ci, les flèches suivent les résultats de la liste.
	let similar = $state.raw<{ sourceId: string; items: (Similarity & { item: ListItem })[] } | null>(null);
	let searching = $state(false);
	const shownSimilar = $derived(similar?.items.find(({ item }) => item.id === id));
	const source = $derived(shownSimilar && similar ? entries.find(similar.sourceId) : undefined);
	const navIds = $derived(shownSimilar && similar ? similar.items.map(({ item }) => item.id) : ids);
	const position = $derived(neighbours(navIds, id));

	const backToSource = () => similar && onchange(similar.sourceId);
	/** Quitte l'aperçu : la ressemblante devient la fiche agrandie, les flèches reviennent aux résultats. */
	const goToShown = () => (similar = null);

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
		if (shownSimilar) return backToSource();
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
	use:swipe={{ onleft: () => show(position?.next), onright: () => show(position?.previous), onup: close }}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={() => onclose()}
>
	{#if entry}
		{@const links = entries.linksOf(entry)}
		{@const tags = entries.tagsOf(entry)}
		{@const rank = entries.rankOf(entry)}
		{@const border = entries.borderOf(entry)}
		<div
			bind:this={box}
			class="modal-box flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md flex-col overflow-x-hidden overflow-y-auto overscroll-contain p-0 outline-none"
			tabindex="-1"
		>
			{#if shownSimilar && source}
				<div class="bg-base-200 flex items-center gap-2 px-2 py-1.5">
					<button class="btn btn-ghost btn-xs min-w-0" aria-label="Retour à {source.name}" onclick={backToSource}>
						<Icon name="back" class="size-3 shrink-0" />
						<span class="truncate">{source.name}</span>
					</button>
					<span class="text-base-content/60 ml-auto shrink-0 text-xs">Similaire à {percent(shownSimilar.score)}</span>
				</div>
			{/if}
			<header class="flex items-center gap-2 px-4 py-2">
				{#if entry.country}<span title={countryName(entry.country)}>{countryFlag(entry.country)}</span>{/if}
				<h2 bind:this={title} class="min-w-0 flex-1 text-lg font-bold break-words">{entry.name}</h2>
				{#if entry.birthYear}<span class="text-base-content/60 shrink-0 text-sm" title="Année de naissance : {entry.birthYear}">{formatAge(entry.birthYear)}</span>{/if}
				{#if entry.validatedAt}<ValidatedMark />{/if}
				<CopyButton text={entry.name} label="Copier le nom" class="btn btn-ghost btn-sm btn-square shrink-0" />
				<button class="btn btn-ghost btn-sm btn-square shrink-0" aria-label="Fermer" onclick={close}>
					<Icon name="close" class="size-4" />
				</button>
			</header>

			<!-- shrink-0 : sinon, quand les similaires allongent la boîte, la figure rétrécit jusqu'à min-h-40 et
			     l'image centrée déborde sur le titre ; la boîte doit défiler à la place. -->
			<!-- Avec bordure, le cadre épouse l'image, posée sur le fond avec une marge pour son halo. -->
			<figure class="bg-base-200 relative flex min-h-40 shrink-0 items-center justify-center {border && entry.thumbUrl ? 'p-4' : ''}">
				{#if entry.thumbUrl}
					{@const imageClass = `object-contain ${border ? 'rounded-box max-h-[calc(45dvh-2rem)] max-w-full' : 'max-h-[45dvh] w-full'}`}
					{#key entry.id}
						<ImageCarousel {entry} {imageClass} {border} onfail={(e) => (error = errorMessage(e))}>
							{#snippet cover()}
								<img bind:this={image} src={entry.thumbUrl} alt="" data-border={border} class={imageClass} />
							{/snippet}
						</ImageCarousel>
					{/key}
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
					<span class="badge badge-sm bg-base-100/70 absolute left-1/2 -translate-x-1/2 border-0 {entry.gallery?.length ? 'top-1' : 'bottom-1'}" role="status">
						{position.position} / {position.count}
					</span>
				{/if}
			</figure>

			<div class="flex flex-col gap-3 p-4">
				<ErrorAlert message={error} />
				<div class="flex items-center gap-2">
					<!-- Validée : note figée, comme le reste de la fiche. -->
					<Rating value={entry.rating} onchange={rate} disabled={readonly || savingRating || !!entry.validatedAt} />
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
					<LinkChips {links} />
				{/if}
				{#if readonly}
					{#if onreroll}
						<button class="btn btn-primary btn-sm" onclick={onreroll}>
							<Icon name="dice" class="size-4" /> Tirer une autre carte
						</button>
					{/if}
				{:else}
					<!-- Vitrine : ni ouverture ni modification ici (elles passent par l'index), les similaires et le dé. -->
					<div class="flex gap-2">
						{#if shownSimilar}
							<button
								class="btn btn-outline btn-primary btn-sm flex-1"
								aria-label="Aller à cette fiche"
								title="Quitter les similaires et continuer depuis cette fiche"
								onclick={goToShown}
							>
								Y aller
							</button>
						{:else}
							<button class="btn btn-outline btn-primary btn-sm flex-1" aria-pressed={!!similar} disabled={searching} onclick={toggleSimilar}>
								{#if searching}<span class="loading loading-spinner loading-xs"></span>{:else}Similaires{/if}
							</button>
						{/if}
						{#if onreroll}
							<button class="btn btn-outline btn-primary btn-sm btn-square" aria-label="Un autre tirage" title="Une autre fiche au hasard" onclick={onreroll}>
								<Icon name="dice" class="size-4" />
							</button>
						{/if}
					</div>
				{/if}
				{#if similar}
					{#if similar.items.length}
						<!-- Marge pour l'outline de la vignette affichée : le défilement coupe tout ce qui dépasse. -->
						<ul class="flex gap-2 overflow-x-auto px-0.5 pt-0.5 pb-1" data-no-swipe>
							{#each similar.items as { item, score } (item.id)}
								<li class="shrink-0">
									<button
										data-border={entries.borderOf(item)}
										class="frame-thin bg-primary/10 rounded-box relative flex size-16 cursor-pointer items-center justify-center overflow-hidden {item.id === id
											? 'outline-primary outline-2'
											: ''}"
										aria-label="Voir {item.name}, ressemblance {percent(score)}"
										title={item.name}
										onclick={() => onchange(item.id)}
									>
										{#if item.thumbUrl}
											<img src={item.thumbUrl} alt="" loading="lazy" decoding="async" class="size-full object-cover {framingClass(item.framing)}" />
										{:else}
											<span class="text-primary font-bold" aria-hidden="true">{item.name.charAt(0).toUpperCase()}</span>
										{/if}
										<span class="badge badge-xs bg-base-100/80 absolute right-0.5 bottom-0.5 border-0" aria-hidden="true">
											{percent(score)}
										</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if shownSimilar}
							<!-- Critères comparables seulement : une donnée absente d'un côté n'est pas comptée. -->
							<p class="text-base-content/70 text-xs" role="status">
								Ressemblance {percent(shownSimilar.score)} :
								{CRITERIA.filter(({ key }) => shownSimilar.details[key] !== undefined)
									.map(({ key, label }) => `${label} ${percent(shownSimilar.details[key]!)}`)
									.join(' · ')}
							</p>
						{:else}
							<p class="text-base-content/60 text-xs">Touchez une vignette pour voir le détail des scores.</p>
						{/if}
					{:else}
						<p class="text-base-content/60 text-sm">Aucune fiche assez proche dans cette collection.</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</dialog>
