<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { deleteEntry, getImage } from '$lib/entries/repository';
	import { entries, loadEntries, removeEntry } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let error = $state('');
	let imageUrl = $state<string | null>(null);
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
		getImage(user.uid, dek, id).then(
			(bytes) => {
				if (cancelled || !bytes) return;
				url = bytesToUrl(bytes, type);
				imageUrl = url;
			},
			(e) => (error = errorMessage(e))
		);
		return () => {
			cancelled = true;
			if (url) URL.revokeObjectURL(url);
			imageUrl = null;
		};
	});

	const removal = formAction(async () => {
		const { user } = session;
		if (!user) throw new Error('Session verrouillée.');
		await deleteEntry(user.uid, id);
		removeEntry(id);
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
	<article class="card bg-base-100 overflow-hidden shadow-sm">
		{#if entry.imageType}
			<figure class="bg-base-200 relative">
				<img class="max-h-[70vh] w-full object-contain" src={imageUrl ?? entry.thumbUrl} alt={entry.name} />
				{#if !imageUrl}
					<span class="loading loading-spinner text-primary absolute top-3 right-3"></span>
				{/if}
			</figure>
		{/if}
		<div class="card-body gap-4">
			<h1 class="card-title text-2xl break-words">{entry.name}</h1>

			{#if entry.links.length}
				<ul class="flex flex-col gap-2">
					{#each entry.links as link, i (i)}
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
					<p>Supprimer définitivement « {entry.name} » ?</p>
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
					<a class="btn btn-primary" href="/fiche/{entry.id}/modifier"><Icon name="edit" class="size-4" /> Modifier</a>
					<button class="btn btn-outline btn-error" onclick={() => (confirmDelete = true)}>
						<Icon name="trash" class="size-4" /> Supprimer
					</button>
				</div>
			{/if}
		</div>
	</article>
{/if}
