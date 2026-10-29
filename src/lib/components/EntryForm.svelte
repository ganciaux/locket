<script lang="ts">
	// Création et modification d'une fiche. L'image est préparée (redimensionnée) puis chiffrée à l'enregistrement.
	import { goto } from '$app/navigation';
	import { session } from '$lib/auth/session.svelte';
	import { prepareImage } from '$lib/entries/images';
	import { type Link, parseLinkUrl } from '$lib/entries/model';
	import { saveEntry } from '$lib/entries/repository';
	import { type ListItem, upsertEntry } from '$lib/entries/store.svelte';
	import { formAction } from '$lib/form.svelte';

	let { entry }: { entry?: ListItem } = $props();

	// Valeurs initiales seulement : le formulaire édite sa propre copie.
	// svelte-ignore state_referenced_locally
	let name = $state(entry?.name ?? '');
	// svelte-ignore state_referenced_locally
	let links = $state((entry?.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' })));
	let file = $state<File | null>(null);
	let fileInput: HTMLInputElement;
	let imageRemoved = $state(false);

	const newPreview = $derived(file ? URL.createObjectURL(file) : null);
	$effect(() => () => {
		if (newPreview) URL.revokeObjectURL(newPreview);
	});
	const preview = $derived(newPreview ?? (imageRemoved ? undefined : entry?.thumbUrl));

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
		imageRemoved = false;
	}

	function removeImage() {
		file = null;
		fileInput.value = '';
		imageRemoved = true;
	}

	function parseLinks(): Link[] {
		return links
			.filter((l) => l.url.trim())
			.map((l) => {
				const url = parseLinkUrl(l.url);
				if (!url) throw new Error(`Lien invalide : « ${l.url.trim()} » (http ou https uniquement).`);
				const label = l.label.trim();
				return label ? { url, label } : { url };
			});
	}

	const form = formAction(async () => {
		const { user, dek } = session;
		if (!user || !dek) throw new Error('Session verrouillée.');
		const parsedLinks = parseLinks();
		const image = file ? await prepareImage(file) : imageRemoved ? null : undefined;
		const saved = await saveEntry(user.uid, dek, { name, links: parsedLinks, image }, entry);
		upsertEntry(saved);
		await goto(`/fiche/${saved.id}`, { replaceState: true });
	});
</script>

<form onsubmit={form.submit}>
	<label>
		Nom
		<input bind:value={name} maxlength="200" required />
	</label>

	<fieldset>
		<legend>Liens</legend>
		{#each links as link, i (i)}
			<div class="link-row">
				<input
					inputmode="url"
					autocapitalize="off"
					autocomplete="off"
					spellcheck="false"
					placeholder="https://…"
					aria-label="Adresse"
					bind:value={link.url}
				/>
				<input placeholder="Libellé (facultatif)" aria-label="Libellé" bind:value={link.label} />
				<button type="button" class="link" onclick={() => links.splice(i, 1)}>Retirer</button>
			</div>
		{/each}
		<button type="button" class="secondary" onclick={() => links.push({ url: '', label: '' })}>Ajouter un lien</button>
	</fieldset>

	<fieldset>
		<legend>Image</legend>
		{#if preview}
			<img class="preview" src={preview} alt="Aperçu" />
			<button type="button" class="link" onclick={removeImage}>Retirer l'image</button>
		{/if}
		<input type="file" accept="image/*" bind:this={fileInput} onchange={onFileChange} />
	</fieldset>

	{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
	<button disabled={form.busy}>{form.busy ? 'Enregistrement…' : 'Enregistrer'}</button>
</form>
