<script lang="ts">
	// Mode Tagger : les fiches de la file (figée depuis l'index) une à une, tags modifiables sur place.
	// « Enregistrer et suivante » passe à la prochaine fiche pas encore faite ; flèches, glissement et ← → parcourent la file.
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import FullImage from '$lib/components/FullImage.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { countryFlag, countryName, formatAge, neighbours } from '$lib/entries/model';
	import { changeEntriesTags, entries, loadEntries } from '$lib/entries/store.svelte';
	import { markTagged, showTagged, stopTagging, tagging } from '$lib/entries/tagging.svelte';
	import { errorMessage } from '$lib/errors';
	import { swipe } from '$lib/swipe';

	let error = $state('');
	let saving = $state(false);
	let selected = $state<string[]>([]);

	loadEntries().catch((e) => (error = errorMessage(e)));

	// Une fiche supprimée entre-temps sort de la file.
	const ids = $derived((tagging.current?.ids ?? []).filter((id) => entries.find(id)));
	const id = $derived(tagging.current?.currentId ?? '');
	const entry = $derived(entries.find(id));
	const done = $derived(tagging.current?.done ?? []);
	const position = $derived(neighbours(ids, id));
	// Prochaine fiche pas encore faite : après celle-ci, sinon une fiche sautée plus haut.
	const toDo = (other: string) => other !== id && !done.includes(other);
	const nextToDo = $derived(ids.slice(ids.indexOf(id) + 1).find(toDo) ?? ids.find(toDo));
	const remaining = $derived(ids.filter((other) => !done.includes(other)).length);

	// Tags connus de la fiche (un tag supprimé n'est pas repris : enregistrer le retire).
	const saved = $derived(entry ? entries.tagsOf(entry).map((tag) => tag.id) : []);
	const dirty = $derived(selected.length !== saved.length || selected.some((tagId) => !saved.includes(tagId)));

	// Brouillon remis aux tags de la fiche quand elle change (autre fiche, ou enregistrée) ; pas à chaque mise à jour du store.
	$effect(() => {
		void entry;
		selected = untrack(() => [...saved]);
	});

	// Quitter la fiche avec des tags non enregistrés : la modale demande quoi en faire, puis reprend l'action.
	let confirmDialog = $state<HTMLDialogElement>();
	let pending: (() => void) | null = null;

	function guard(action: () => void) {
		if (!dirty) return action();
		pending = action;
		confirmDialog?.showModal();
	}

	function discard() {
		const action = pending;
		confirmDialog?.close();
		action?.();
	}

	async function saveThen() {
		const action = pending;
		confirmDialog?.close();
		await save(false);
		if (!dirty) action?.();
	}

	function show(other: string | undefined) {
		if (!other) return;
		guard(() => {
			error = '';
			showTagged(other);
			window.scrollTo(0, 0);
		});
	}

	function quit() {
		guard(() => {
			stopTagging();
			goto('/list');
		});
	}

	async function save(andNext: boolean) {
		if (!entry || saving) return;
		saving = true;
		error = '';
		try {
			if (dirty) await changeEntriesTags([entry], selected, 'set');
			markTagged(entry.id);
			if (andNext) {
				if (nextToDo) show(nextToDo);
				else quit();
			}
		} catch (e) {
			error = errorMessage(e);
		} finally {
			saving = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (confirmDialog?.open) return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') show(position?.previous);
		if (event.key === 'ArrowRight') show(position?.next);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="mb-4 flex items-center gap-2">
	<button class="btn btn-ghost btn-sm -ml-2" onclick={quit}><Icon name="back" class="size-4" /> Quitter</button>
	{#if position}
		<div class="ml-auto flex items-center gap-1">
			<button
				class="btn btn-ghost btn-sm btn-square"
				disabled={!position.previous}
				aria-label="Fiche précédente"
				title="Fiche précédente (flèche gauche)"
				onclick={() => show(position.previous)}
			>
				<Icon name="back" class="size-4" />
			</button>
			<span class="text-base-content/60 text-xs" role="status">{position.position} / {position.count}</span>
			<button
				class="btn btn-ghost btn-sm btn-square"
				disabled={!position.next}
				aria-label="Fiche suivante"
				title="Fiche suivante (flèche droite)"
				onclick={() => show(position.next)}
			>
				<Icon name="forward" class="size-4" />
			</button>
		</div>
	{/if}
</div>

{#if !tagging.current}
	<p class="text-base-content/60 py-8 text-center">
		Aucune fiche à tagger. <a class="link link-primary" href="/list">Partir de l'index</a>
	</p>
{:else if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.items && !entry}
	<ErrorAlert message={error} />
	<p class="alert alert-warning alert-soft">Fiche introuvable.</p>
{:else if entry}
	<!-- overflow-clip et non hidden : hidden ferait de la carte le conteneur du pied collant, qui ne collerait plus. -->
	<article
		class="card bg-base-100 overflow-clip shadow-sm"
		use:swipe={{ onleft: () => show(position?.next), onright: () => show(position?.previous) }}
	>
		<header class="flex flex-col gap-1 p-4 sm:px-6">
			<div class="flex items-start gap-2">
				<h1 class="card-title min-w-0 flex-1 text-2xl break-words">{entry.name}</h1>
				{#if done.includes(entry.id)}<span class="badge badge-success badge-soft shrink-0">Faite</span>{/if}
			</div>
			<p class="text-base-content/60 flex flex-wrap items-center gap-1 text-xs">
				<span>{done.length} faite{done.length > 1 ? 's' : ''} · {remaining} restante{remaining > 1 ? 's' : ''}</span>
				{#if entry.country}<span aria-hidden="true">·</span><span>{countryFlag(entry.country)} {countryName(entry.country)}</span>{/if}
				{#if entry.birthYear}<span aria-hidden="true">·</span><span>{formatAge(entry.birthYear)}</span>{/if}
			</p>
		</header>
		{#if entry.imageType}
			<figure class="bg-base-200 relative">
				{#key id}
					<FullImage
						{id}
						type={entry.imageType}
						thumbUrl={entry.thumbUrl}
						alt={entry.name}
						class="max-h-[45vh] w-full object-contain"
						onfail={(e) => (error = errorMessage(e))}
					/>
				{/key}
			</figure>
		{/if}
		<div class="card-body gap-4">
			{#if entries.tagsIn(entry.collectionId).length}
				<TagPicker
					tags={entries.tagsIn(entry.collectionId)}
					groups={entries.tagGroupsIn(entry.collectionId)}
					bind:selected
					label="Tags de la fiche"
				/>
			{:else}
				<p class="text-base-content/60 text-sm">
					Aucun tag dans cette collection. <a class="link link-primary" href="/tags">Créer des tags</a>
				</p>
			{/if}
			<ErrorAlert message={error} />
		</div>

		<!-- Pied de la carte, collé en bas de l'écran : la liste des tags peut être longue. -->
		<div
			class="bg-base-100 border-base-200 sticky bottom-0 grid grid-cols-[auto_1fr] gap-2 border-t sm:grid-cols-2 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6"
		>
			<!-- Icône seule sur téléphone : le bouton principal tient sur une ligne. -->
			<button
				class="btn btn-outline btn-primary"
				disabled={saving || !dirty}
				aria-label="Enregistrer"
				title="Enregistrer"
				onclick={() => save(false)}
			>
				<Icon name="save" class="size-4" /><span class="hidden sm:inline">Enregistrer</span>
			</button>
			<button class="btn btn-primary" disabled={saving} onclick={() => save(true)}>
				{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
				{nextToDo ? 'Enregistrer et suivante' : 'Enregistrer et terminer'}
			</button>
		</div>
	</article>

	<dialog bind:this={confirmDialog} class="modal modal-bottom sm:modal-middle" onclose={() => (pending = null)}>
		<div class="modal-box">
			<h2 class="text-lg font-bold">Modifications non enregistrées</h2>
			<p class="text-base-content/70 py-2 text-sm">Les tags de « {entry.name} » ont changé.</p>
			<div class="modal-action flex-wrap">
				<button class="btn btn-ghost" onclick={() => confirmDialog?.close()}>Continuer la saisie</button>
				<button class="btn btn-outline btn-error" onclick={discard}>Abandonner</button>
				<button class="btn btn-primary" disabled={saving} onclick={saveThen}>Enregistrer</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop"><button>Fermer</button></form>
	</dialog>
{/if}
