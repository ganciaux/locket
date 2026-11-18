<script lang="ts">
	// Classement par duels : la fiche à classer affronte celle du milieu de la plage encore possible (voir model.ts).
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import FullImage from '$lib/components/FullImage.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ImageCarousel from '$lib/components/ImageCarousel.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import {
		type Insertion,
		chooseInsertion,
		duelsLeft,
		insertionDone,
		isRankable,
		opponentIndex,
		sliceZone,
		startInsertion
	} from '$lib/entries/model';
	import { finishNewRanking, placeInRanking } from '$lib/entries/ranking';
	import { type ListItem, entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	// `?id=` : reclasser cette fiche, puis repartir ; sinon, les fiches non classées l'une après l'autre.
	const rerankId = page.url.searchParams.get('id');
	// Retour à la page d'origine : liste, gestion du classement ou fiche.
	let backHref = $state(rerankId ? `/entry/${rerankId}` : '/ranking');
	afterNavigate(({ from }) => {
		if (from) backHref = from.url.pathname;
	});

	let ready = $state(false);
	let error = $state('');
	let collectionId = $state('');
	let candidateId = $state<string | null>(null);
	// Classement effectif sans la fiche à classer, figé pendant ses duels.
	let ranked = $state.raw<string[]>([]);
	let insertion = $state<Insertion>(startInsertion(0));
	let history = $state.raw<Insertion[]>([]);
	let skipped = $state.raw<string[]>([]);
	// Côté de la fiche à classer, tiré à chaque duel : toujours à gauche, elle serait favorisée.
	let swap = $state(false);
	let saving = $state(false);
	let draftFinished = $state(false);

	const collection = $derived(entries.collections?.find((c) => c.id === collectionId));
	const candidate = $derived(candidateId ? entries.find(candidateId) : undefined);
	const opponent = $derived(insertionDone(insertion) ? undefined : entries.find(ranked[opponentIndex(insertion)]));
	const rankedCount = $derived(collectionId ? entries.rankingTarget(collectionId).length : 0);
	const pending = $derived(collectionId ? entries.unranked(collectionId) : []);
	const inDraft = $derived(!!collectionId && !!entries.rankingDraft(collectionId));
	const slice = $derived(collectionId ? entries.rankingSlice(collectionId) : null);
	// Fiche dont on regarde toutes les images, avant de choisir : une seule ne suffit pas toujours.
	let viewing = $state<ListItem | null>(null);

	loadEntries().then(
		() => {
			const target = rerankId ? entries.find(rerankId) : undefined;
			if (target && isRankable(target)) {
				collectionId = target.collectionId;
				start(target.id);
			} else if (!rerankId && entries.active) {
				collectionId = entries.active.id;
				next();
			}
			ready = true;
		},
		(e) => (error = errorMessage(e))
	);

	function start(id: string) {
		candidateId = id;
		ranked = entries.rankingTarget(collectionId).filter((other) => other !== id);
		// Affinage d'une tranche : seulement entre ses fiches déjà replacées.
		const zone = slice?.ids.includes(id) ? slice : null;
		insertion = zone ? sliceZone(ranked, zone) : startInsertion(ranked.length);
		history = [];
		swap = Math.random() < 0.5;
		// La toute première fiche classée n'a pas d'adversaire.
		if (insertionDone(insertion)) save();
	}

	function next() {
		const choices = entries.unranked(collectionId).filter((item) => !skipped.includes(item.id));
		if (choices.length) {
			start(choices[Math.floor(Math.random() * choices.length)].id);
			return;
		}
		candidateId = null;
		// Toutes les fiches sont passées par les duels : le nouveau classement remplace l'ancien.
		if (entries.rankingDraft(collectionId) && !skipped.length) finishDraft();
	}

	async function finishDraft() {
		saving = true;
		error = '';
		try {
			await finishNewRanking(collectionId);
			draftFinished = true;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			saving = false;
		}
	}

	function choose(candidateWins: boolean) {
		viewing = null;
		history = [...history, insertion];
		insertion = chooseInsertion(insertion, candidateWins);
		swap = Math.random() < 0.5;
		if (insertionDone(insertion)) save();
	}

	function undo() {
		insertion = history[history.length - 1];
		history = history.slice(0, -1);
	}

	function skip() {
		if (candidateId) skipped = [...skipped, candidateId];
		next();
	}

	const openModal = (node: HTMLDialogElement) => node.showModal();

	async function save() {
		if (!candidateId) return;
		saving = true;
		error = '';
		try {
			await placeInRanking(collectionId, candidateId, ranked, insertion.lo);
			if (rerankId) await goto(backHref, { replaceState: true });
			else next();
		} catch (e) {
			error = errorMessage(e);
		} finally {
			saving = false;
		}
	}
</script>

<a href={backHref} class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Retour</a>

<h1 class="text-2xl font-bold">
	{slice ? `Affiner les rangs ${slice.start + 1} à ${slice.start + slice.ids.length}` : inDraft ? 'Nouveau classement' : 'Classement'}
</h1>
{#if collection}
	<p class="text-base-content/60 mb-4 text-sm">
		{#if slice}
			{collection.name} · {slice.ids.length - pending.length} / {slice.ids.length} replacées
		{:else}
			{collection.name} · {rankedCount} classée{rankedCount > 1 ? 's' : ''}, {pending.length} à classer
		{/if}
	</p>
{/if}

<ErrorAlert message={error} />

{#if !ready && !error}
	<PageSpinner />
{:else if candidate && opponent}
	<p class="mb-3 font-semibold">Laquelle préférez-vous ?</p>
	<div class="grid grid-cols-2 gap-3">
		{#each swap ? [opponent, candidate] : [candidate, opponent] as item (item.id)}
			<!-- Le bouton des images passe au-dessus de la carte : deux boutons ne peuvent pas s'imbriquer. -->
			<div class="relative">
				<button
					type="button"
					data-border={entries.borderOf(item)}
					class="card bg-base-100 w-full cursor-pointer overflow-hidden text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
					disabled={saving}
					aria-label="Préférer {item.name}"
					onclick={() => choose(item.id === candidate.id)}
				>
					<!-- Image entière, pas recadrée : on compare ce qu'on verrait sur la fiche. -->
					<figure class="bg-base-200 relative aspect-[3/4]">
						<FullImage
							id={item.id}
							type={item.imageType}
							thumbUrl={item.thumbUrl}
							alt=""
							class="size-full object-contain"
							onfail={(e) => (error = errorMessage(e))}
						/>
					</figure>
					<span class="truncate px-3 py-2 text-sm font-semibold">{item.name}</span>
				</button>
				{#if item.gallery?.length}
					<button
						type="button"
						class="badge bg-base-100/80 absolute top-2 right-2 h-7 cursor-pointer gap-1 border-0 shadow-sm"
						aria-label="Voir les {item.gallery.length + 1} images de {item.name}"
						onclick={() => (viewing = item)}
					>
						<Icon name="images" class="size-3.5" />{item.gallery.length + 1}
					</button>
				{/if}
			</div>
		{/each}
	</div>
	{#if viewing}
		{@const shown = viewing}
		<!-- Toutes les images d'une des deux fiches ; on peut la préférer d'ici. Échap ou le fond ferment. -->
		<dialog class="modal bg-black/60" aria-label="Images de {shown.name}" use:openModal onclose={() => (viewing = null)}>
			<div class="modal-box flex w-[calc(100%-2rem)] max-w-md flex-col gap-3 p-0 pb-4">
				<h2 class="px-4 pt-4 font-semibold">{shown.name}</h2>
				<div class="bg-base-200">
					{#key shown.id}
						<ImageCarousel entry={shown} imageClass="max-h-[60dvh] w-full object-contain" onfail={(e) => (error = errorMessage(e))}>
							{#snippet cover()}
								<FullImage
									id={shown.id}
									type={shown.imageType}
									thumbUrl={shown.thumbUrl}
									alt="{shown.name}, image 1"
									class="max-h-[60dvh] w-full object-contain"
									onfail={(e) => (error = errorMessage(e))}
								/>
							{/snippet}
						</ImageCarousel>
					{/key}
				</div>
				<div class="flex justify-end gap-2 px-4">
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (viewing = null)}>Fermer</button>
					<button type="button" class="btn btn-primary btn-sm" disabled={saving} onclick={() => choose(shown.id === candidate.id)}>
						Préférer {shown.name}
					</button>
				</div>
			</div>
			<form method="dialog" class="modal-backdrop"><button tabindex="-1" aria-hidden="true">Fermer</button></form>
		</dialog>
	{/if}
	<p class="text-base-content/60 mt-3 text-xs" role="status">
		Encore {duelsLeft(insertion)} duel{duelsLeft(insertion) > 1 ? 's' : ''} au plus pour « {candidate.name} ».
	</p>
	<div class="mt-4 flex flex-wrap gap-2">
		<button class="btn btn-outline btn-primary btn-sm" disabled={!history.length || saving} onclick={undo}>Annuler le dernier choix</button>
		{#if !rerankId}
			<button class="btn btn-ghost btn-sm" disabled={saving} onclick={skip}>Passer cette fiche</button>
		{/if}
	</div>
{:else if candidate}
	{#if error}
		<button class="btn btn-primary mt-4" onclick={save}>Réessayer</button>
	{:else}
		<PageSpinner />
	{/if}
{:else if ready}
	<p class="alert alert-info alert-soft">
		{#if draftFinished}
			Nouveau classement terminé : il remplace le précédent.
		{:else if !collection}
			{rerankId ? 'Fiche introuvable, ou sans image : seules les fiches avec image se classent.' : 'Aucune collection.'}
		{:else if rankedCount + pending.length === 0}
			Aucune fiche avec image dans cette collection : seules les fiches avec image se classent.
		{:else if skipped.length}
			Plus de fiche à classer pour l'instant ({skipped.length} passée{skipped.length > 1 ? 's' : ''}).
		{:else}
			Toutes les fiches avec image sont classées.
		{/if}
	</p>
	<div class="mt-4 flex flex-wrap gap-2">
		{#if skipped.length}
			<button
				class="btn btn-outline btn-primary btn-sm"
				onclick={() => {
					skipped = [];
					next();
				}}>Reprendre les fiches passées</button
			>
			{#if inDraft}
				<button class="btn btn-outline btn-primary btn-sm" disabled={saving} onclick={finishDraft}>Terminer sans elles</button>
			{/if}
		{/if}
		{#if error && inDraft && !skipped.length}
			<button class="btn btn-outline btn-primary btn-sm" disabled={saving} onclick={finishDraft}>Réessayer</button>
		{/if}
		<a class="btn btn-primary btn-sm" href="/ranking">Voir le classement</a>
	</div>
{/if}
