<script lang="ts">
	// Classement par duels : la fiche à classer affronte celle du milieu de la plage encore possible (voir model.ts).
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import FullImage from '$lib/components/FullImage.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		type Insertion,
		chooseInsertion,
		duelsLeft,
		insertionDone,
		isRankable,
		opponentIndex,
		startInsertion
	} from '$lib/entries/model';
	import { entries, loadEntries, placeInRanking } from '$lib/entries/store.svelte';
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

	const collection = $derived(entries.collections?.find((c) => c.id === collectionId));
	const candidate = $derived(candidateId ? entries.find(candidateId) : undefined);
	const opponent = $derived(insertionDone(insertion) ? undefined : entries.find(ranked[opponentIndex(insertion)]));
	const rankedCount = $derived(collectionId ? entries.ranking(collectionId).length : 0);
	const pending = $derived(collectionId ? entries.unranked(collectionId) : []);

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
		ranked = entries.ranking(collectionId).filter((other) => other !== id);
		insertion = startInsertion(ranked.length);
		history = [];
		swap = Math.random() < 0.5;
		// La toute première fiche classée n'a pas d'adversaire.
		if (insertionDone(insertion)) save();
	}

	function next() {
		const choices = entries.unranked(collectionId).filter((item) => !skipped.includes(item.id));
		if (choices.length) start(choices[Math.floor(Math.random() * choices.length)].id);
		else candidateId = null;
	}

	function choose(candidateWins: boolean) {
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

<h1 class="text-2xl font-bold">Classement</h1>
{#if collection}
	<p class="text-base-content/60 mb-4 text-sm">
		{collection.name} · {rankedCount} classée{rankedCount > 1 ? 's' : ''}, {pending.length} à classer
	</p>
{/if}

<ErrorAlert message={error} />

{#if !ready && !error}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if candidate && opponent}
	<p class="mb-3 font-semibold">Laquelle préférez-vous ?</p>
	<div class="grid grid-cols-2 gap-3">
		{#each swap ? [opponent, candidate] : [candidate, opponent] as item (item.id)}
			<button
				type="button"
				class="card bg-base-100 cursor-pointer overflow-hidden text-left shadow-sm transition hover:shadow-md disabled:opacity-60"
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
		{/each}
	</div>
	<p class="text-base-content/60 mt-3 text-xs" role="status">
		Encore {duelsLeft(insertion)} duel{duelsLeft(insertion) > 1 ? 's' : ''} au plus pour « {candidate.name} ».
	</p>
	<div class="mt-4 flex flex-wrap gap-2">
		<button class="btn btn-sm" disabled={!history.length || saving} onclick={undo}>Annuler le dernier choix</button>
		{#if !rerankId}
			<button class="btn btn-ghost btn-sm" disabled={saving} onclick={skip}>Passer cette fiche</button>
		{/if}
	</div>
{:else if candidate}
	{#if error}
		<button class="btn btn-primary mt-4" onclick={save}>Réessayer</button>
	{:else}
		<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
	{/if}
{:else if ready}
	<p class="alert alert-info alert-soft">
		{#if !collection}
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
				class="btn btn-sm"
				onclick={() => {
					skipped = [];
					next();
				}}>Reprendre les fiches passées</button
			>
		{/if}
		<a class="btn btn-primary btn-sm" href="/ranking">Voir le classement</a>
	</div>
{/if}
