<script lang="ts">
	// Création et modification d'une fiche. L'image est préparée (redimensionnée) puis chiffrée à l'enregistrement.
	import { goto } from '$app/navigation';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Rating from '$lib/components/Rating.svelte';
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
	let links = $state((entry?.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '', hidden: !!l.hidden })));
	// svelte-ignore state_referenced_locally
	let tagIds = $state([...(entry?.tagIds ?? [])]);
	// svelte-ignore state_referenced_locally
	let siteTerms = $state<Record<string, string>>({ ...entry?.siteTerms });
	// svelte-ignore state_referenced_locally
	let hiddenSites = $state([...(entry?.hiddenSites ?? [])]);
	// svelte-ignore state_referenced_locally
	let hidden = $state(!!entry?.hidden);
	// svelte-ignore state_referenced_locally
	let rating = $state(entry?.rating);
	// Nouvelle fiche : la collection active (connue une fois le catalogue chargé), sauf choix explicite.
	// svelte-ignore state_referenced_locally
	let chosenCollectionId = $state(entry?.collectionId ?? '');
	const collectionId = $derived(chosenCollectionId || entries.active?.id || '');
	const collectionTags = $derived(entries.tagsIn(collectionId));
	const collectionSites = $derived(entries.sitesIn(collectionId));
	const activeSites = $derived(collectionSites.filter((site) => site.enabled));
	let tagsDropped = $state(false);
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

	/** Coller une image (capture d'écran, image copiée) ; un collage de texte suit son cours normal. */
	function onPaste(event: ClipboardEvent) {
		const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
		if (!image) return;
		event.preventDefault();
		fileInput.value = '';
		file = image;
		imageRemoved = false;
	}

	function removeImage() {
		file = null;
		fileInput.value = '';
		imageRemoved = true;
	}

	// Les tags et les sites appartiennent à une collection : en changer les retire de la fiche.
	function changeCollection(event: Event) {
		chosenCollectionId = (event.currentTarget as HTMLSelectElement).value;
		tagsDropped = tagIds.length > 0;
		tagIds = [];
		siteTerms = {};
		hiddenSites = [];
	}

	function toggleHidden(siteId: string) {
		hiddenSites = hiddenSites.includes(siteId) ? hiddenSites.filter((id) => id !== siteId) : [...hiddenSites, siteId];
	}

	/** Seuls les termes remplis et les sites encore connus sont gardés (ceux d'un site inactif aussi). */
	function knownSiteTerms(): Record<string, string> {
		const terms = collectionSites.map((site) => [site.id, siteTerms[site.id]?.trim()]);
		return Object.fromEntries(terms.filter(([, term]) => term));
	}

	function parseLinks(): Link[] {
		return links
			.filter((l) => l.url.trim())
			.map((l) => {
				const url = parseLinkUrl(l.url);
				if (!url) throw new Error(`Lien invalide : « ${l.url.trim()} » (http ou https uniquement).`);
				const label = l.label.trim();
				return { url, ...(label && { label }), ...(l.hidden && { hidden: true }) };
			});
	}

	const form = formAction(async () => {
		const { user, dek } = session;
		if (!user || !dek) throw new Error('Session verrouillée.');
		if (!entries.tags) throw new Error('Tags pas encore chargés.');
		if (!entries.collections?.some((c) => c.id === collectionId)) throw new Error('Choisissez une collection.');
		const parsedLinks = parseLinks();
		// Les identifiants de tags supprimés entre-temps sont oubliés ici.
		const knownTagIds = entries.tagsOf({ collectionId, tagIds }).map((tag) => tag.id);
		const image = file ? await prepareImage(file) : imageRemoved ? null : undefined;
		const saved = await saveEntry(
			user.uid,
			dek,
			{
				collectionId,
				name,
				links: parsedLinks,
				tagIds: knownTagIds,
				siteTerms: knownSiteTerms(),
				hiddenSites: hiddenSites.filter((id) => collectionSites.some((site) => site.id === id)),
				hidden,
				rating,
				image
			},
			entry
		);
		upsertEntry(saved);
		await goto(`/entry/${saved.id}`, { replaceState: true });
	});
</script>

<svelte:window onpaste={onPaste} />

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<Field label="Nom">
				<input class="input input-lg w-full" bind:value={name} maxlength={MAX_NAME_LENGTH} required />
			</Field>
			{#if entries.collections && entries.collections.length > 1}
				<Field label="Collection">
					<select class="select w-full" value={collectionId} onchange={changeCollection}>
						{#each entries.collections as collection (collection.id)}
							<option value={collection.id}>{collection.name}</option>
						{/each}
					</select>
				</Field>
			{/if}
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Note</span>
				<div class="flex items-center gap-2">
					<Rating value={rating} onchange={(value) => (rating = value)} />
					{#if rating}
						<button type="button" class="btn btn-ghost btn-xs" onclick={() => (rating = undefined)}>Effacer</button>
					{/if}
				</div>
			</div>
			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Cacher cette fiche</span>
					<span class="text-base-content/60 text-xs">Elle n'apparaît dans la liste qu'avec le bouton « Cachées ».</span>
				</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={hidden} />
			</label>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-base"><Icon name="link" /> Liens</h2>
			{#if activeSites.length}
				<p class="text-base-content/60 text-xs">
					Sites de la collection : décochez pour masquer le lien sur cette fiche, laissez vide pour chercher son nom.
				</p>
				{#each activeSites as site (site.id)}
					{@const hidden = hiddenSites.includes(site.id)}
					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							checked={!hidden}
							onchange={() => toggleHidden(site.id)}
							aria-label="Afficher {site.label} sur cette fiche"
							title="Afficher sur cette fiche"
						/>
						<label class="input input-sm min-w-0 flex-1">
							<span class="label">{site.label}</span>
							<input
								placeholder={name}
								aria-label="Terme à chercher sur {site.label}"
								disabled={hidden}
								bind:value={siteTerms[site.id]}
							/>
						</label>
					</div>
				{/each}
			{/if}
			{#each links as link, i (i)}
				<div class="bg-base-200 rounded-box grid grid-cols-[auto_1fr_auto] items-start gap-2 p-3">
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-sm mt-1.5"
						checked={!link.hidden}
						onchange={() => (link.hidden = !link.hidden)}
						aria-label="Afficher ce lien sur la fiche"
						title="Afficher sur la fiche"
					/>
					<div class="flex flex-col gap-2">
						<input
							class="input input-sm w-full"
							disabled={link.hidden}
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
							disabled={link.hidden}
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
				onclick={() => links.push({ url: '', label: '', hidden: false })}
			>
				<Icon name="plus" class="size-4" /> Ajouter un lien
			</button>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-base"><Icon name="tag" /> Tags</h2>
			{#if tagsDropped}
				<p role="status" class="text-base-content/70 text-xs">
					Les tags de l'ancienne collection ont été retirés : chaque collection a les siens.
				</p>
			{/if}
			{#if collectionTags.length}
				<TagPicker tags={collectionTags} bind:selected={tagIds} label="Tags de la fiche" />
			{:else if entries.tags}
				<p class="text-base-content/60 text-sm">
					Aucun tag dans cette collection. <a class="link link-primary" href="/tags">Créer des tags</a>
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
			<p class="text-base-content/60 text-xs">
				Choisissez un fichier, glissez-le ici ou collez une image. Redimensionnée et chiffrée sur cet appareil avant l'envoi.
			</p>
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
