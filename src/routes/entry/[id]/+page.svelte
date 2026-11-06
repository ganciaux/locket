<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import FullImage from '$lib/components/FullImage.svelte';
	import GalleryStrip from '$lib/components/GalleryStrip.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import UnrankConfirm from '$lib/components/UnrankConfirm.svelte';
	import ValidatedMark from '$lib/components/ValidatedMark.svelte';
	import { entryNav } from '$lib/entries/entryNav.svelte';
	import { TRASH_DAYS, countryFlag, countryName, formatAge, formatRating, groupTags, neighbours, pickRandom } from '$lib/entries/model';
	import { deleteForever, entries, loadEntries, rateEntry, setEntriesValidated, trashEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';
	import { prefs } from '$lib/prefs.svelte';
	import { playReveal } from '$lib/reveal';
	import { swipe } from '$lib/swipe';

	let error = $state('');
	let confirmDelete = $state(false);
	let confirmUnrank = $state(false);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const id = $derived(page.params.id ?? '');
	const entry = $derived(entries.find(id));
	const groupedTags = $derived(!!entry && entries.tagGroupsIn(entry.collectionId).length > 0);
	const tagSections = $derived(entry ? groupTags(entries.tagsOf(entry), entries.tagGroupsIn(entry.collectionId)) : []);

	// Liste d'origine si la fiche y figure (voir entryNav) ; sinon sa collection, par nom.
	const origin = $derived(entryNav.current?.ids.includes(id) ? entryNav.current : null);
	const navIds = $derived(
		(origin?.ids ?? (entry ? entries.siblings(entry).map((item) => item.id) : [])).filter((other) => entries.find(other))
	);
	const position = $derived(neighbours(navIds, id));
	const backHref = $derived(origin?.backHref ?? '/');
	const backLabel = $derived(origin?.backLabel ?? 'Mes fiches');

	// Remplace l'adresse : le retour du navigateur ramène à la page d'origine, pas à chaque fiche parcourue.
	const open = (other: string | undefined) => other && goto(`/entry/${other}`, { replaceState: true });

	// Tirage au hasard (dé de la liste, `?tirage`) : la carte se révèle, et le dé du bandeau en refait un parmi la
	// même liste. Les flèches quittent le tirage.
	const drawn = $derived(page.url.searchParams.has('tirage'));
	let figure = $state<HTMLElement>();
	// Autre image affichée à la place de la couverture (bande `GalleryStrip`) ; null : la couverture.
	let shownImage = $state<string | null>(null);
	let title = $state<HTMLElement>();
	$effect(() => {
		void id;
		if (!drawn) return;
		untrack(() => tick().then(() => {
			const image = figure?.querySelector('img');
			if (image) playReveal(image, title, { mode: prefs.revealMode, random: prefs.revealRandom, duration: prefs.revealMs });
		}));
	});
	function reroll() {
		const other = pickRandom(navIds, id);
		if (other) goto(`/entry/${other}?tirage`, { replaceState: true });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') open(position?.previous);
		if (event.key === 'ArrowRight') open(position?.next);
	}

	// Le composant reste en place d'une fiche à l'autre : une confirmation ouverte ne doit pas suivre.
	$effect(() => {
		void id;
		confirmDelete = confirmUnrank = false;
	});

	// Corbeille par défaut ; la suppression définitive emporte aussi l'image, sans retour possible.
	let removeMode = $state<'trash' | 'forever'>('trash');
	const removal = formAction(async () => {
		if (entry) await (removeMode === 'forever' ? deleteForever([entry]) : trashEntries([entry]));
		await goto(backHref, { replaceState: true });
	});

	// Notée directement depuis la fiche : enregistrée aussitôt, comme « Cacher ».
	let savingRating = $state(false);
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

	// Validée : enregistrée aussitôt, comme la note.
	let savingValidation = $state(false);
	async function toggleValidated() {
		if (!entry || savingValidation) return;
		savingValidation = true;
		error = '';
		try {
			await setEntriesValidated([entry], !entry.validatedAt);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			savingValidation = false;
		}
	}

	const formatDate = (time: number) =>
		new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="mb-4 flex items-center gap-2">
	<a href={backHref} class="btn btn-ghost btn-sm -ml-2"><Icon name="back" class="size-4" /> {backLabel}</a>
	{#if position && position.count > 1}
		<div class="ml-auto flex items-center gap-1">
			<button
				class="btn btn-ghost btn-sm btn-square"
				disabled={!position.previous}
				aria-label="Fiche précédente"
				title="Fiche précédente (flèche gauche)"
				onclick={() => open(position.previous)}
			>
				<Icon name="back" class="size-4" />
			</button>
			<span class="text-base-content/60 text-xs" role="status">{position.position} / {position.count}</span>
			<button
				class="btn btn-ghost btn-sm btn-square"
				disabled={!position.next}
				aria-label="Fiche suivante"
				title="Fiche suivante (flèche droite)"
				onclick={() => open(position.next)}
			>
				<Icon name="forward" class="size-4" />
			</button>
		</div>
	{/if}
</div>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<PageSpinner />
{:else if entries.items && !entry}
	<p class="alert alert-warning alert-soft">Fiche introuvable.</p>
{:else if entry}
	{@const collection = entries.collections?.find((c) => c.id === entry.collectionId)}
	{@const links = entries.linksOf(entry)}
	<article
		class="card bg-base-100 overflow-hidden shadow-sm"
		use:swipe={{ onleft: () => open(position?.next), onright: () => open(position?.previous) }}
	>
		<header class="flex flex-col gap-1 p-4 sm:px-6">
			<div class="flex items-start gap-2">
				<h1 bind:this={title} class="card-title min-w-0 flex-1 text-2xl break-words">{entry.name}</h1>
				{#if entry.validatedAt}<ValidatedMark class="h-8" />{/if}
				<CopyButton text={entry.name} label="Copier le nom" class="btn btn-ghost btn-sm btn-square shrink-0" />
			</div>
			{#if entry.validatedAt}
				<p class="text-primary flex items-center gap-1 text-sm font-medium">
					<Icon name="validated" class="size-4" /> Validée le {formatDate(entry.validatedAt)}
				</p>
			{/if}
			{#if collection}
				<p class="text-base-content/60 flex items-center gap-1 text-xs">
					<Icon name="folder" class="size-3" />{collection.name}
					{#if entry.country}<span aria-hidden="true">·</span><span class="mr-0.5">{countryFlag(entry.country)}</span><span>{countryName(entry.country)}</span>{/if}
					{#if entry.birthYear}<span aria-hidden="true">·</span><span>{formatAge(entry.birthYear)} ({entry.birthYear})</span>{/if}
				</p>
			{/if}
		</header>
		{#if entry.imageType}
			<!-- Avec bordure, le cadre épouse l'image, posée sur le fond avec une marge pour son halo. -->
			{@const border = entries.borderOf(entry)}
			{@const imageClass = `object-contain ${border ? 'rounded-box max-h-[calc(60vh-2rem)] max-w-full' : 'max-h-[60vh] w-full'}`}
			<figure bind:this={figure} class="bg-base-200 relative {border ? 'flex justify-center p-4' : ''}">
				{#if shownImage}
					<img src={shownImage} alt={entry.name} data-border={border} class={imageClass} />
				{:else}
					{#key id}
						<FullImage
							{id}
							type={entry.imageType}
							thumbUrl={entry.thumbUrl}
							alt={entry.name}
							{border}
							class={imageClass}
							onfail={(e) => (error = errorMessage(e))}
						/>
					{/key}
				{/if}
			</figure>
			{#if entry.gallery?.length}
				{#key id}
					<GalleryStrip
						{entry}
						thumbUrl={entry.thumbUrl}
						shown={shownImage}
						onshow={(url) => (shownImage = url)}
						onfail={(e) => (error = errorMessage(e))}
					/>
				{/key}
			{/if}
		{/if}
		<div class="card-body gap-4">
			<div class="flex items-center gap-2">
				<Rating value={entry.rating} onchange={rate} disabled={savingRating || !!entry.validatedAt} />
				<span class="text-base-content/60 text-sm">
					{entry.rating ? `${formatRating(entry.rating)} / 5` : 'Pas encore notée'}
				</span>
			</div>

			{#if entry.imageType}
				{@const rank = entries.rankOf(entry)}
				<div class="-mt-2 flex items-center gap-2 text-sm">
					<Icon name="podium" class="size-4 opacity-60" />
					<span class="text-base-content/60">
						{rank ? `${rank === 1 ? '1re' : `${rank}e`} sur ${entries.ranking(entry.collectionId).length} au classement` : 'Pas encore classée'}
					</span>
					<a class="btn btn-ghost btn-xs" href="/ranking/duel?id={entry.id}">{rank ? 'Reclasser' : 'Classer'}</a>
					{#if rank && !confirmUnrank}
						<button class="btn btn-ghost btn-xs" onclick={() => (confirmUnrank = true)}>Retirer</button>
					{/if}
				</div>
				{#if rank && confirmUnrank}
					<UnrankConfirm {entry} onclose={() => (confirmUnrank = false)} />
				{/if}
			{/if}

			<!-- Avec des catégories : une ligne par catégorie, son nom devant ses tags. -->
			{#if tagSections.length}
				<div class="-mt-2 flex flex-col gap-1.5">
					{#each tagSections as section (section.group?.id ?? '')}
						<div class="flex flex-wrap items-center gap-2">
							{#if groupedTags}
								<span class="text-base-content/60 text-xs">{section.group?.name ?? 'Autres'}</span>
							{/if}
							{#each section.tags as tag (tag.id)}
								<span class="badge badge-soft badge-primary">{tag.name}</span>
							{/each}
						</div>
					{/each}
				</div>
			{/if}

			{#if entry.remarks}
				<p class="bg-base-200 rounded-box p-3 text-sm break-words whitespace-pre-line">{entry.remarks}</p>
			{/if}

			{#if links.length}
				<ul class="flex flex-col gap-2">
					{#each links as link, i (i)}
						<li class="bg-base-200 rounded-box flex items-center gap-3 p-3">
							<Icon name="external" class="text-primary size-4 shrink-0" />
							<span class="min-w-0 flex-1 break-all">
								<ExternalLink url={link.url}>{link.label || link.url}</ExternalLink>
								{#if link.label}<span class="text-base-content/50 block truncate text-xs">{link.url}</span>{/if}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-base-content/60 text-sm">Aucun lien.</p>
			{/if}

			<p class="text-base-content/50 text-xs">Modifiée le {formatDate(entry.updatedAt)}</p>
		</div>
	</article>
	<ActionBar label="Actions de la fiche">
		{#if confirmDelete}
			<form class="alert alert-error alert-soft flex flex-col items-stretch gap-3" onsubmit={removal.submit}>
				<p>
					{#if entry.validatedAt}<strong>Cette fiche est validée.</strong>{/if}
					Supprimer « {entry.name} » ? La corbeille la garde {TRASH_DAYS} jours ; la suppression définitive est
					irréversible.
				</p>
				<ErrorAlert message={removal.error} />
				<div class="flex flex-wrap gap-2">
					<button class="btn btn-error btn-sm" disabled={removal.busy} onclick={() => (removeMode = 'trash')}>
						{#if removal.busy && removeMode === 'trash'}<span class="loading loading-spinner loading-xs"></span>{/if}
						Mettre à la corbeille
					</button>
					<button class="btn btn-error btn-outline btn-sm" disabled={removal.busy} onclick={() => (removeMode = 'forever')}>
						{#if removal.busy && removeMode === 'forever'}<span class="loading loading-spinner loading-xs"></span>{/if}
						Supprimer définitivement
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmDelete = false)}>Annuler</button>
				</div>
			</form>
		{:else}
			<!-- Retour : déjà en haut de la page. Le « + » remplace le bouton flottant, qui couvrirait le bandeau. -->
			<div class="flex items-center gap-2">
				<a class="btn btn-primary flex-1 sm:flex-none" href="/entry/{entry.id}/edit"><Icon name="edit" class="size-4" /> Modifier</a>
				<button
					class="btn {entry.validatedAt ? 'btn-ghost' : 'btn-outline btn-primary'}"
					disabled={savingValidation}
					title={entry.validatedAt ? 'Elle redevient modifiable sans confirmation' : 'Fiche finie : la protéger des modifications'}
					onclick={toggleValidated}
				>
					<Icon name="validated" class="size-4" />
					{#if entry.validatedAt}<span class="sm:hidden">Dévalider</span><span class="hidden sm:inline">Retirer la validation</span>{:else}Valider{/if}
				</button>
				<button class="btn btn-outline btn-error" aria-label="Supprimer" title="Supprimer" onclick={() => (confirmDelete = true)}>
					<Icon name="trash" class="size-4" /> <span class="hidden sm:inline">Supprimer</span>
				</button>
				{#if drawn && navIds.length > 1}
					<button class="btn btn-ghost btn-square ml-auto" aria-label="Un autre tirage" title="Une autre fiche au hasard" onclick={reroll}>
						<Icon name="dice" class="size-5" />
					</button>
				{/if}
				<a class="btn btn-primary btn-circle {drawn && navIds.length > 1 ? '' : 'ml-auto'}" href="/entry/new" aria-label="Nouvelle fiche" title="Nouvelle fiche">
					<Icon name="plus" class="size-6" />
				</a>
			</div>
		{/if}
	</ActionBar>
{/if}
