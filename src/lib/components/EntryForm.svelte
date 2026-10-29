<script lang="ts">
	// Création et modification d'une fiche. L'image est préparée (redimensionnée) puis chiffrée à l'enregistrement.
	import { goto } from '$app/navigation';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { prepareImage } from '$lib/entries/images';
	import { type Link, MAX_NAME_LENGTH, parseLinkUrl } from '$lib/entries/model';
	import { saveEntry } from '$lib/entries/repository';
	import { type ListItem, entries, loadEntries, upsertEntry } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let { entry, cancelHref }: { entry?: ListItem; cancelHref: string } = $props();

	// Valeurs initiales seulement : le formulaire édite sa propre copie.
	// svelte-ignore state_referenced_locally
	let name = $state(entry?.name ?? '');
	// svelte-ignore state_referenced_locally
	let links = $state((entry?.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' })));
	// svelte-ignore state_referenced_locally
	let tagIds = $state([...(entry?.tagIds ?? [])]);
	let file = $state<File | null>(null);
	let loadError = $state('');

	// Catalogue de tags (et fiches) : déjà en mémoire le plus souvent, sinon chargé ici.
	loadEntries().catch((e) => (loadError = errorMessage(e)));
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
		if (!entries.tags) throw new Error('Tags pas encore chargés.');
		const parsedLinks = parseLinks();
		// Les identifiants de tags supprimés entre-temps sont oubliés ici.
		const knownTagIds = entries.tagsOf({ tagIds }).map((tag) => tag.id);
		const image = file ? await prepareImage(file) : imageRemoved ? null : undefined;
		const saved = await saveEntry(user.uid, dek, { name, links: parsedLinks, tagIds: knownTagIds, image }, entry);
		upsertEntry(saved);
		await goto(`/fiche/${saved.id}`, { replaceState: true });
	});
</script>

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<Field label="Nom">
				<input class="input input-lg w-full" bind:value={name} maxlength={MAX_NAME_LENGTH} required />
			</Field>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-base"><Icon name="link" /> Liens</h2>
			{#each links as link, i (i)}
				<div class="bg-base-200 rounded-box grid grid-cols-[1fr_auto] gap-2 p-3">
					<div class="flex flex-col gap-2">
						<input
							class="input input-sm w-full"
							inputmode="url"
							autocapitalize="off"
							autocomplete="off"
							spellcheck="false"
							placeholder="https://…"
							aria-label="Adresse"
							bind:value={link.url}
						/>
						<input
							class="input input-sm w-full"
							placeholder="Libellé (facultatif)"
							aria-label="Libellé"
							bind:value={link.label}
						/>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-sm btn-square"
						onclick={() => links.splice(i, 1)}
						aria-label="Retirer ce lien"
						title="Retirer ce lien"
					>
						<Icon name="close" class="size-4" />
					</button>
				</div>
			{:else}
				<p class="text-base-content/60 text-sm">Aucun lien.</p>
			{/each}
			<button
				type="button"
				class="btn btn-outline btn-primary btn-sm self-start"
				onclick={() => links.push({ url: '', label: '' })}
			>
				<Icon name="plus" class="size-4" /> Ajouter un lien
			</button>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-base"><Icon name="tag" /> Tags</h2>
			{#if entries.tags?.length}
				<TagPicker tags={entries.tags} bind:selected={tagIds} label="Tags de la fiche" />
			{:else if entries.tags}
				<p class="text-base-content/60 text-sm">
					Aucun tag pour l'instant. <a class="link link-primary" href="/tags">Créer des tags</a>
				</p>
			{:else}
				<span class="loading loading-dots loading-sm"></span>
			{/if}
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-base"><Icon name="image" /> Image</h2>
			{#if preview}
				<div class="relative self-start">
					<img class="rounded-box max-h-56 w-auto" src={preview} alt="Aperçu" />
					<button
						type="button"
						class="btn btn-circle btn-sm absolute top-2 right-2"
						onclick={removeImage}
						aria-label="Retirer l'image"
						title="Retirer l'image"
					>
						<Icon name="close" class="size-4" />
					</button>
				</div>
			{/if}
			<input type="file" accept="image/*" class="file-input w-full" bind:this={fileInput} onchange={onFileChange} />
			<p class="text-base-content/60 text-xs">Redimensionnée et chiffrée sur cet appareil avant l'envoi.</p>
		</div>
	</section>

	<ErrorAlert message={loadError} />
	<ErrorAlert message={form.error} />
	<div class="flex gap-2">
		<button class="btn btn-primary flex-1 sm:flex-none" disabled={form.busy}>
			{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Enregistrement…{:else}Enregistrer{/if}
		</button>
		<a class="btn btn-ghost" href={cancelHref}>Annuler</a>
	</div>
</form>
