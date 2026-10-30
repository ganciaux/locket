<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { TRASH_DAYS, countryFlag, countryName, formatRating } from '$lib/entries/model';
	import { getImage } from '$lib/entries/repository';
	import { deleteForever, entries, loadEntries, rateEntry, trashEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let error = $state('');
	let imageUrl = $state<string | null>(null);
	let imageLoading = $state(false);
	let confirmDelete = $state(false);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const id = $derived(page.params.id ?? '');
	const entry = $derived(entries.find(id));

	// L'image complète n'est téléchargée et déchiffrée qu'ici, puis libérée en quittant la page.
	$effect(() => {
		const { user, dek } = session;
		const type = entry?.imageType;
		if (!user || !dek || !type) return;
		let url: string | null = null;
		let cancelled = false;
		imageLoading = true;
		getImage(user.uid, dek, id)
			.then(
				(bytes) => {
					if (cancelled || !bytes) return;
					url = bytesToUrl(bytes, type);
					imageUrl = url;
				},
				(e) => (error = errorMessage(e))
			)
			// Aussi sans image (sauvegarde légère dans un compte recréé) : la miniature reste affichée.
			.finally(() => {
				if (!cancelled) imageLoading = false;
			});
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
			imageUrl = null;
			imageLoading = false;
		};
	});

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

	let copied = $state(false);
	async function copyName() {
		if (!entry) return;
		await navigator.clipboard.writeText(entry.name);
		copied = true;
		setTimeout(() => (copied = false), 1500);
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
				<img class="max-h-[70vh] w-full object-contain" src={imageUrl ?? entry.thumbUrl} alt={entry.name} />
				{#if imageLoading}
					<span class="loading loading-spinner text-primary absolute top-3 right-3"></span>
				{/if}
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
				<button
					class="btn btn-ghost btn-sm btn-square shrink-0"
					onclick={copyName}
					aria-label={copied ? 'Nom copié' : 'Copier le nom'}
					title={copied ? 'Copié' : 'Copier le nom'}
				>
					<Icon name={copied ? 'check' : 'copy'} class="size-4" />
				</button>
			</div>

			<div class="-mt-2 flex items-center gap-2">
				<Rating value={entry.rating} onchange={rate} disabled={savingRating} />
				<span class="text-base-content/60 text-sm">
					{entry.rating ? `${formatRating(entry.rating)} / 5` : 'Pas encore notée'}
				</span>
			</div>

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
{/if}
