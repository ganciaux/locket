<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { session } from '$lib/auth/session.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
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
	const hasImage = $derived(!!entry?.imageType);

	// L'image complète n'est téléchargée et déchiffrée qu'ici, puis libérée en quittant la page.
	$effect(() => {
		const { user, dek } = session;
		if (!user || !dek || !hasImage || !entry?.imageType) return;
		const type = entry.imageType;
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

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if !entries.items}
	<p>Déchiffrement…</p>
{:else if !entry}
	<p>Fiche introuvable.</p>
{:else}
	<h1>{entry.name}</h1>

	{#if hasImage}
		<img class="full" src={imageUrl ?? entry.thumbUrl} alt={entry.name} />
	{/if}

	{#if entry.links.length}
		<ul class="links">
			{#each entry.links as link, i (i)}
				<li><ExternalLink url={link.url}>{link.label || link.url}</ExternalLink></li>
			{/each}
		</ul>
	{:else}
		<p class="hint">Aucun lien.</p>
	{/if}

	<p class="hint">Modifiée le {formatDate(entry.updatedAt)}</p>

	<div class="bar">
		<a class="button" href="/fiche/{entry.id}/modifier">Modifier</a>
		{#if !confirmDelete}
			<button class="danger" onclick={() => (confirmDelete = true)}>Supprimer</button>
		{/if}
	</div>

	{#if confirmDelete}
		<form class="confirm" onsubmit={removal.submit}>
			<p>Supprimer définitivement « {entry.name} » ?</p>
			{#if removal.error}<p class="error" role="alert">{removal.error}</p>{/if}
			<div class="bar">
				<button class="danger" disabled={removal.busy}>{removal.busy ? 'Suppression…' : 'Supprimer'}</button>
				<button type="button" class="link" onclick={() => (confirmDelete = false)}>Annuler</button>
			</div>
		</form>
	{/if}
{/if}

<p><a href="/">Retour à la liste</a></p>
