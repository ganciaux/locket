<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import FullImage from '$lib/components/FullImage.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import NewEntryButton from '$lib/components/NewEntryButton.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import { TRASH_DAYS, countryFlag, countryName, formatRating } from '$lib/entries/model';
	import { deleteForever, entries, loadEntries, rateEntry, removeFromRanking, trashEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let error = $state('');
	let confirmDelete = $state(false);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const id = $derived(page.params.id ?? '');
	const entry = $derived(entries.find(id));

	// Corbeille par défaut ; la suppression définitive emporte aussi l'image, sans retour possible.
	let removeMode = $state<'trash' | 'forever'>('trash');
	const removal = formAction(async () => {
		if (entry) await (removeMode === 'forever' ? deleteForever([entry]) : trashEntries([entry]));
		await goto('/', { replaceState: true });
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

	async function unrank() {
		if (!entry) return;
		error = '';
		try {
			await removeFromRanking(entry.collectionId, entry.id);
		} catch (e) {
			error = errorMessage(e);
		}
	}

	const formatDate = (time: number) =>
		new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<a href="/" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Mes fiches</a>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.items && !entry}
	<p class="alert alert-warning alert-soft">Fiche introuvable.</p>
{:else if entry}
	{@const collection = entries.collections?.find((c) => c.id === entry.collectionId)}
	{@const links = entries.linksOf(entry)}
	<article class="card bg-base-100 overflow-hidden shadow-sm">
		{#if entry.imageType}
			<figure class="bg-base-200 relative">
				<FullImage
					{id}
					type={entry.imageType}
					thumbUrl={entry.thumbUrl}
					alt={entry.name}
					class="max-h-[70vh] w-full object-contain"
					onfail={(e) => (error = errorMessage(e))}
				/>
			</figure>
		{/if}
		<div class="card-body gap-4">
			{#if collection}
				<p class="text-base-content/60 -mb-3 flex items-center gap-1 text-xs">
					<Icon name="folder" class="size-3" />{collection.name}
					{#if entry.country}<span aria-hidden="true">·</span><span class="mr-0.5">{countryFlag(entry.country)}</span><span>{countryName(entry.country)}</span>{/if}
				</p>
			{/if}
			<div class="flex items-start gap-2">
				<h1 class="card-title min-w-0 flex-1 text-2xl break-words">{entry.name}</h1>
				<CopyButton text={entry.name} label="Copier le nom" class="btn btn-ghost btn-sm btn-square shrink-0" />
			</div>

			<div class="-mt-2 flex items-center gap-2">
				<Rating value={entry.rating} onchange={rate} disabled={savingRating} />
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
					{#if rank}
						<button class="btn btn-ghost btn-xs" onclick={unrank}>Retirer</button>
					{/if}
				</div>
			{/if}

			{#if entries.tagsOf(entry).length}
				<div class="-mt-2 flex flex-wrap gap-2">
					{#each entries.tagsOf(entry) as tag (tag.id)}
						<span class="badge badge-soft badge-primary">{tag.name}</span>
					{/each}
				</div>
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

			{#if confirmDelete}
				<form class="alert alert-error alert-soft flex flex-col items-stretch gap-3" onsubmit={removal.submit}>
					<p>
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
				<div class="card-actions">
					<a class="btn btn-primary" href="/entry/{entry.id}/edit"><Icon name="edit" class="size-4" /> Modifier</a>
					<button class="btn btn-outline btn-error" onclick={() => (confirmDelete = true)}>
						<Icon name="trash" class="size-4" /> Supprimer
					</button>
					<a class="btn btn-ghost" href="/"><Icon name="back" class="size-4" /> Retour</a>
				</div>
			{/if}
		</div>
	</article>
	<NewEntryButton />
{/if}
