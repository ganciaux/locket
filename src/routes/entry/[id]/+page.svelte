<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { TRASH_DAYS } from '$lib/entries/model';
	import { getImage } from '$lib/entries/repository';
	import { entries, loadEntries, trashEntries } from '$lib/entries/store.svelte';
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

	const removal = formAction(async () => {
		if (entry) await trashEntries([entry]);
		await goto('/', { replaceState: true });
	});

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
				</p>
			{/if}
			<h1 class="card-title text-2xl break-words">{entry.name}</h1>

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
					<p>Mettre « {entry.name} » à la corbeille ? Elle y reste {TRASH_DAYS} jours.</p>
					<ErrorAlert message={removal.error} />
					<div class="flex gap-2">
						<button class="btn btn-error btn-sm" disabled={removal.busy}>
							{#if removal.busy}<span class="loading loading-spinner loading-xs"></span>{/if} Supprimer
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
				</div>
			{/if}
		</div>
	</article>
{/if}
