<script lang="ts">
	// Création et modification d'une fiche. L'image est préparée (redimensionnée) puis chiffrée à l'enregistrement.
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { session } from '$lib/auth/session.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ImageEditor from '$lib/components/ImageEditor.svelte';
	import CountryPicker from '$lib/components/CountryPicker.svelte';
	import Rating from '$lib/components/Rating.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import { prepareGalleryImage, prepareImage, prepareMiniThumb } from '$lib/entries/images';
	import { FRAMING_CENTER, FRAMING_STEP, type GalleryItem, type Link, MAX_GALLERY, MAX_IMAGES, MAX_NAME_LENGTH, framingClass, MAX_REMARKS_LENGTH, MIN_BIRTH_YEAR, moveTo, type Site, parseLinkUrl, searchKey, siteShown, withSiteVisibility } from '$lib/entries/model';
	import { getGalleryImages, getImage, saveEntry } from '$lib/entries/repository';
	import { type ListItem, entries, loadEntries, upsertEntry } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';
	import { sortable } from '$lib/sortable';

	let {
		entry,
		cancelHref,
		doneHref,
		initialCollectionId = '',
		onnext
	}: {
		entry?: ListItem;
		cancelHref: string;
		/** Page ouverte après l'enregistrement ; par défaut, la fiche. */
		doneHref?: string;
		initialCollectionId?: string;
		/** Création à la suite : appelé après l'enregistrement, au lieu d'ouvrir la fiche. */
		onnext?: (saved: { name: string; collectionId: string }) => void;
	} = $props();

	// Valeurs initiales seulement : le formulaire édite sa propre copie.
	// svelte-ignore state_referenced_locally
	let name = $state(entry?.name ?? '');
	let nameInput = $state<HTMLInputElement>();
	// svelte-ignore state_referenced_locally
	let links = $state((entry?.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '', hidden: !!l.hidden })));
	// svelte-ignore state_referenced_locally
	let tagIds = $state([...(entry?.tagIds ?? [])]);
	// svelte-ignore state_referenced_locally
	let siteTerms = $state<Record<string, string>>({ ...entry?.siteTerms });
	// svelte-ignore state_referenced_locally
	let hiddenSites = $state([...(entry?.hiddenSites ?? [])]);
	// svelte-ignore state_referenced_locally
	let shownSites = $state([...(entry?.shownSites ?? [])]);
	// svelte-ignore state_referenced_locally
	let hidden = $state(!!entry?.hidden);
	// svelte-ignore state_referenced_locally
	let rating = $state(entry?.rating);
	// svelte-ignore state_referenced_locally
	let country = $state(entry?.country);
	// svelte-ignore state_referenced_locally
	let birthYear = $state<number | null | undefined>(entry?.birthYear);
	// svelte-ignore state_referenced_locally
	let remarks = $state(entry?.remarks ?? '');
	// svelte-ignore state_referenced_locally
	let framing = $state(entry?.framing ?? FRAMING_CENTER);
	// Sens de l'aperçu, lu à son chargement : le cadrage n'a de sens que pour une image non carrée.
	let shape = $state<'tall' | 'wide' | 'square' | null>(null);
	function readShape(event: Event) {
		const { naturalWidth: width, naturalHeight: height } = event.currentTarget as HTMLImageElement;
		shape = height > width ? 'tall' : width > height ? 'wide' : 'square';
	}
	// Nouvelle fiche : la collection active (connue une fois le catalogue chargé), sauf choix explicite.
	// svelte-ignore state_referenced_locally
	let chosenCollectionId = $state(entry?.collectionId ?? initialCollectionId);
	const collectionId = $derived(chosenCollectionId || entries.active?.id || '');
	// Les cachées ne sont pas proposées, sauf celle déjà choisie (fiche ouverte par son lien).
	const collectionChoices = $derived(
		(entries.collections ?? []).filter((c) => c.id === collectionId || entries.shownCollections?.includes(c))
	);
	const collectionTags = $derived(entries.tagsIn(collectionId));
	const collectionSites = $derived(entries.sitesIn(collectionId));
	const activeSites = $derived(collectionSites.filter((site) => site.enabled));
	// Nom unique dans la collection : vérifié pendant la saisie, et de nouveau à l'enregistrement.
	// Un doublon d'avant cette règle reste modifiable tant que son nom et sa collection ne changent pas.
	const nameUnchanged = $derived(!!entry && entry.collectionId === collectionId && searchKey(entry.name) === searchKey(name));
	const sameName = $derived(nameUnchanged ? undefined : entries.sameName(collectionId, name, entry?.id));
	const nameChecked = $derived(!!entries.items && !!name.trim());
	let tagsDropped = $state(false);
	let file = $state<File | null>(null);
	let loadError = $state('');

	// Catalogue de tags (et fiches) : déjà en mémoire le plus souvent, sinon chargé ici.
	loadEntries().catch((e) => (loadError = errorMessage(e)));
	let imageRemoved = $state(false);

	const newPreview = $derived(file ? URL.createObjectURL(file) : null);
	$effect(() => () => {
		if (newPreview) URL.revokeObjectURL(newPreview);
	});
	const preview = $derived(newPreview ?? (imageRemoved ? undefined : entry?.thumbUrl));

	/** Coller une image (capture d'écran, image copiée), n'importe où : ajoutée à la suite ; un collage de texte suit son cours normal. */
	function onPaste(event: ClipboardEvent) {
		const images = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		event.preventDefault();
		addImages(images);
		// Collée depuis la zone : le clavier du téléphone se referme.
		if (document.activeElement === pasteZone) pasteZone?.blur();
	}

	// Recadrer ou pivoter : la nouvelle image si elle vient d'être choisie, sinon l'image complète enregistrée (déchiffrée).
	let editing = $state<Blob | null>(null);
	let openingEditor = $state(false);
	async function openEditor() {
		if (file) return void (editing = file);
		const { user, dek } = session;
		if (!entry?.imageType || !user || !dek) return;
		openingEditor = true;
		loadError = '';
		try {
			const bytes = await getImage(user.uid, dek, entry.id);
			if (!bytes) throw new Error('Image introuvable.');
			editing = new Blob([bytes], { type: entry.imageType });
		} catch (e) {
			loadError = errorMessage(e);
		} finally {
			openingEditor = false;
		}
	}

	function applyEdit(edited: File) {
		editing = null;
		file = edited;
		imageRemoved = false;
		framing = FRAMING_CENTER;
	}

	function removeImage() {
		// Pas d'autres images sans couverture : la suivante prend sa place.
		const [next, ...rest] = gallery;
		if (next) {
			gallery = rest;
			galleryTouched = true;
			URL.revokeObjectURL(next.url);
			setCover(next.blob);
			return;
		}
		file = null;
		imageRemoved = true;
	}

	// Autres images (voir gallery.ts) : chargées à l'ouverture, réordonnées, promues en couverture, enregistrées avec la
	// fiche. `slot` : déjà enregistrée à cet emplacement (octets inchangés) ; `raw` : fichier choisi, à préparer.
	type Pic = { blob: Blob; url: string; slot?: number; raw: boolean };
	let gallery = $state<Pic[]>([]);
	// Rien n'est réécrit tant que la galerie n'a pas changé. Tant qu'elle se charge ou si elle n'a pas pu l'être, rien
	// ne peut la changer (ni le retrait de la couverture, qui l'emporterait) : on ne perd pas d'images non affichées.
	let galleryTouched = $state(false);
	// svelte-ignore state_referenced_locally
	let galleryLoading = $state(!!entry?.gallery?.length);
	let galleryFailed = $state(false);
	/** Images annoncées mais illisibles ou absentes : retirées si la galerie est modifiée. */
	let galleryMissing = $state(0);
	const galleryLocked = $derived(galleryLoading || galleryFailed);
	// Couverture comprise ; tant que les autres ne sont pas chargées, celles annoncées par la fiche.
	const imageCount = $derived((preview ? 1 : 0) + (galleryLocked ? (entry?.gallery?.length ?? 0) : gallery.length));
	const pic = (blob: Blob, raw: boolean, slot?: number): Pic => ({ blob, url: URL.createObjectURL(blob), raw, ...(slot && { slot }) });

	// Une seule fois, à l'ouverture (pas d'effet qui suivrait la session : la page est démontée au verrouillage).
	// svelte-ignore state_referenced_locally
	if (entry?.gallery?.length) loadGallery(entry);
	async function loadGallery(source: ListItem) {
		const { user, dek } = session;
		const types = source.gallery ?? [];
		try {
			if (!user || !dek) throw new Error('Session verrouillée.');
			const images = await getGalleryImages(user.uid, dek, source);
			if (destroyed) return;
			gallery = images.flatMap((bytes, i) => (bytes ? [pic(new Blob([bytes], { type: types[i] }), false, i + 1)] : []));
			galleryMissing = images.filter((bytes) => !bytes).length;
		} catch (e) {
			galleryFailed = true;
			loadError = `Autres images non chargées (${errorMessage(e)}) : elles restent telles quelles, rouvrez la fiche pour les modifier.`;
		} finally {
			galleryLoading = false;
		}
	}
	let destroyed = false;
	onDestroy(() => {
		destroyed = true;
		gallery.forEach((item) => URL.revokeObjectURL(item.url));
	});

	/** Nouvelle couverture (fichier, image collée ou autre image promue) : cadrage remis au centre. */
	function setCover(blob: Blob) {
		file = blob instanceof File ? blob : new File([blob], 'image', { type: blob.type });
		imageRemoved = false;
		framing = FRAMING_CENTER;
	}

	function onFilesChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		addImages([...(input.files ?? [])]);
		input.value = '';
	}

	/** Un seul point d'entrée (fichiers, glisser, coller) : la première image devient la couverture, les suivantes la suivent. */
	function addImages(blobs: Blob[]) {
		let images = blobs.filter((blob) => blob.type.startsWith('image/'));
		loadError = '';
		if (!images.length) return;
		if (!preview) {
			setCover(images[0]);
			images = images.slice(1);
			if (!images.length) return;
		}
		if (galleryLocked) {
			loadError = 'Les autres images de la fiche ne sont pas chargées : rien ajouté à la suite.';
			return;
		}
		const room = MAX_GALLERY - gallery.length;
		if (images.length > room) loadError = `${MAX_IMAGES} images au plus par fiche : ${images.length - room} non ajoutée(s).`;
		gallery = [...gallery, ...images.slice(0, room).map((blob) => pic(blob, true))];
		galleryTouched = true;
	}

	// Zone de collage : sur iPhone, le bouton « Coller » ne lit pas toujours le presse-papiers, un champ texte si
	// (appui long, « Coller ») ; le collage passe alors par `onPaste`, comme Ctrl+V.
	let pasteZone = $state<HTMLInputElement>();

	/**
	 * Bouton « Coller » : lit l'image du presse-papiers (bulle « Coller » de Safari, autorisation de Chrome). Sur iPhone,
	 * il échoue souvent : le message donne l'étape et l'erreur exacte (diagnostic), et renvoie à la zone de collage.
	 * Seuls les types du presse-papiers sont affichés, jamais son contenu.
	 */
	async function pasteImages() {
		loadError = '';
		const fallback = 'appuyez longuement dans la zone en pointillés, puis « Coller ».';
		if (!navigator.clipboard?.read) {
			loadError = `Ce navigateur ne lit pas le presse-papiers depuis un bouton : ${fallback}`;
			pasteZone?.focus();
			return;
		}
		let step = 'lecture';
		try {
			const items = await navigator.clipboard.read();
			const types = new Set<string>();
			const blobs: Blob[] = [];
			step = 'image';
			for (const item of items) {
				item.types.forEach((type) => types.add(type));
				const type = item.types.find((t) => t.startsWith('image/'));
				if (type) blobs.push(await item.getType(type));
			}
			// Safari (iPhone) ne donne souvent au bouton que le lien de l'image (text/uri-list), alors que le collage
			// natif, dans la zone, reçoit le fichier : on y renvoie plutôt que d'aller chercher le lien sur le réseau.
			if (!blobs.length) {
				loadError = types.size
					? `Ce navigateur ne donne au bouton que le lien ou le texte copié (${[...types].join(', ')}), pas l'image : ${fallback}`
					: `Presse-papiers vide pour ce bouton : copiez d'abord une image, ou ${fallback}`;
				pasteZone?.focus();
				return;
			}
			addImages(blobs);
		} catch (e) {
			if (e instanceof DOMException) {
				const detail = `${step} : ${e.name}${e.message ? `, ${e.message}` : ''}`;
				loadError = `Presse-papiers inaccessible depuis ce bouton (${detail}) : ${fallback}`;
				pasteZone?.focus();
			} else loadError = errorMessage(e);
		}
	}

	function moveInGallery(from: number, to: number) {
		const next = [...gallery];
		[next[from], next[to]] = [next[to], next[from]];
		gallery = next;
		galleryTouched = true;
	}

	/**
	 * Glisser-déposer : `from` et `to` comptent la couverture (0) puis les autres images. La couverture change par
	 * `makeCover` (échange), puis l'image échangée est replacée : on obtient l'ordre voulu, les autres décalées.
	 */
	async function reorder(from: number, to: number) {
		if (from > 0 && to > 0) {
			gallery = moveTo(gallery, from - 1, to - 1);
			galleryTouched = true;
		} else if (to === 0) {
			if (await makeCover(from - 1)) gallery = moveTo(gallery, from - 1, 0);
		} else if (await makeCover(0)) gallery = moveTo(gallery, 0, to - 1);
	}

	function removeFromGallery(index: number) {
		URL.revokeObjectURL(gallery[index].url);
		gallery = gallery.filter((_, i) => i !== index);
		galleryTouched = true;
	}

	/** L'image choisie devient la couverture ; l'ancienne couverture prend sa place parmi les autres. */
	let promoting = $state(false);
	async function makeCover(index: number): Promise<boolean> {
		const { user, dek } = session;
		if (!user || !dek) return false;
		promoting = true;
		loadError = '';
		try {
			let previous: Pic | null = null;
			if (file) previous = pic(file, true);
			else if (!imageRemoved && entry?.imageType) {
				const bytes = await getImage(user.uid, dek, entry.id);
				if (!bytes) throw new Error('Image introuvable.');
				previous = pic(new Blob([bytes], { type: entry.imageType }), false);
			}
			const chosen = gallery[index];
			gallery = previous ? gallery.map((item, i) => (i === index ? previous : item)) : gallery.filter((_, i) => i !== index);
			galleryTouched = true;
			setCover(chosen.blob);
			URL.revokeObjectURL(chosen.url);
			return true;
		} catch (e) {
			loadError = errorMessage(e);
			return false;
		} finally {
			promoting = false;
		}
	}

	/** Vignettes refaites à chaque enregistrement de la galerie : quelques Ko chacune, depuis l'image en mémoire. */
	async function galleryItems(): Promise<GalleryItem[]> {
		return Promise.all(
			gallery.map(async (item) => {
				const thumb = await prepareMiniThumb(item.blob);
				if (item.raw) return { ...(await prepareGalleryImage(item.blob)), thumb };
				const image = new Uint8Array(await item.blob.arrayBuffer());
				return { type: item.blob.type, image, thumb, ...(item.slot && { slot: item.slot }) };
			})
		);
	}

	// Les tags et les sites appartiennent à une collection : en changer les retire de la fiche.
	function changeCollection(event: Event) {
		chosenCollectionId = (event.currentTarget as HTMLSelectElement).value;
		tagsDropped = tagIds.length > 0;
		tagIds = [];
		siteTerms = {};
		hiddenSites = [];
		shownSites = [];
	}

	function toggleSite(site: Site) {
		const show = !siteShown({ hiddenSites, shownSites }, site);
		const next = withSiteVisibility({ hiddenSites, shownSites }, [site], () => show);
		hiddenSites = next.hiddenSites ?? [];
		shownSites = next.shownSites ?? [];
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

	let thenNext = false;

	const form = formAction(async () => {
		const { user, dek } = session;
		if (!user || !dek) throw new Error('Session verrouillée.');
		if (!entries.tags) throw new Error('Tags pas encore chargés.');
		if (!entries.collections?.some((c) => c.id === collectionId)) throw new Error('Choisissez une collection.');
		if (sameName) throw new Error(`« ${sameName.name} » existe déjà dans cette collection.`);
		const parsedLinks = parseLinks();
		// Les identifiants de tags supprimés entre-temps sont oubliés ici.
		const knownTagIds = entries.tagsOf({ collectionId, tagIds }).map((tag) => tag.id);
		const image = file ? await prepareImage(file) : imageRemoved ? null : undefined;
		const extraImages = galleryTouched ? await galleryItems() : undefined;
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
				shownSites: shownSites.filter((id) => collectionSites.some((site) => site.id === id)),
				hidden,
				rating,
				country,
				birthYear: birthYear ?? undefined,
				remarks,
				framing,
				image,
				gallery: extraImages
			},
			entry
		);
		upsertEntry(saved);
		if (thenNext) onnext?.(saved);
		else await goto(doneHref ?? `/entry/${saved.id}`, { replaceState: true });
	});
</script>

<svelte:window onpaste={onPaste} />

<!-- Avancer (vers la couverture), retirer, reculer : l'image `n` dans l'ordre de la fiche. -->
{#snippet controls(
	n: number,
	actions: {
		back?: () => void;
		backDisabled?: boolean;
		remove: () => void;
		removeDisabled?: boolean;
		forward?: () => void;
		forwardDisabled?: boolean;
	}
)}
	<div class="flex">
		<button type="button" class="btn btn-ghost btn-xs btn-square" disabled={!actions.back || actions.backDisabled} onclick={actions.back} aria-label="Avancer l'image {n}" title={n === 2 ? 'Mettre en couverture' : 'Avancer'}>
			<Icon name="back" class="size-3.5" />
		</button>
		<button type="button" class="btn btn-ghost btn-xs btn-square" disabled={actions.removeDisabled} onclick={actions.remove} aria-label="Retirer l'image {n}" title="Retirer">
			<Icon name="close" class="size-3.5" />
		</button>
		<button type="button" class="btn btn-ghost btn-xs btn-square" disabled={!actions.forward || actions.forwardDisabled} onclick={actions.forward} aria-label="Reculer l'image {n}" title="Reculer">
			<Icon name="forward" class="size-3.5" />
		</button>
	</div>
{/snippet}

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<Field label="Nom">
				<div class="input input-lg w-full {nameChecked && (sameName ? 'input-error' : 'input-success')}">
					<!-- Création : le nom se saisit tout de suite. -->
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="grow"
						bind:this={nameInput}
						bind:value={name}
						maxlength={MAX_NAME_LENGTH}
						required
						aria-describedby="name-status"
						autofocus={!entry}
					/>
					<!-- Nom déjà pris : la croix efface le champ pour en saisir un autre. -->
					{#if nameChecked && sameName}
						<button
							type="button"
							class="btn btn-ghost btn-sm btn-circle text-error -mr-2 shrink-0"
							aria-label="Effacer le nom"
							title="Effacer le nom"
							onclick={() => {
								name = '';
								nameInput?.focus();
							}}
						>
							<Icon name="close" class="size-5" />
						</button>
					{:else if nameChecked}
						<Icon name="check" class="text-success size-5 shrink-0" />
					{/if}
				</div>
			</Field>
			{#if nameChecked}
				<p id="name-status" class="-mt-3 text-xs {sameName ? 'text-error' : 'text-success'}" role="status">
					{#if sameName}
						Déjà pris dans cette collection : <a class="link" href="/entry/{sameName.id}">voir « {sameName.name} »</a>
					{:else}
						Disponible
					{/if}
				</p>
			{/if}
			{#if collectionChoices.length > 1}
				<Field label="Collection">
					<select class="select w-full" value={collectionId} onchange={changeCollection}>
						{#each collectionChoices as collection (collection.id)}
							<option value={collection.id}>{collection.name}</option>
						{/each}
					</select>
				</Field>
			{/if}
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Pays</span>
				<CountryPicker bind:value={country} frequent={entries.usedCountries} />
			</div>
			<Field label="Année de naissance" hint="Facultative, pour afficher l'âge.">
				<input
					class="input w-32"
					type="number"
					inputmode="numeric"
					min={MIN_BIRTH_YEAR}
					max={new Date().getFullYear()}
					placeholder="1990"
					bind:value={birthYear}
				/>
			</Field>
			<div class="flex flex-col gap-1">
				<span class="text-sm font-medium">Note</span>
				<div class="flex items-center gap-2">
					<Rating value={rating} onchange={(value) => (rating = value)} />
					{#if rating}
						<button type="button" class="btn btn-ghost btn-xs" onclick={() => (rating = undefined)}>Effacer</button>
					{/if}
				</div>
			</div>
			<Field label="Remarques" hint="Facultatives : ce que vous voulez retenir. Trouvées par la recherche.">
				<textarea
					class="textarea w-full"
					rows="3"
					maxlength={MAX_REMARKS_LENGTH}
					placeholder="Vu en 2024, tome 12 manquant…"
					bind:value={remarks}
				></textarea>
			</Field>
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
			<!-- Un seul champ : la première image est la couverture (carte, liste), les suivantes sont affichées sur la fiche. -->
			<h2 class="card-title text-base">
				<Icon name="image" /> Images
				{#if preview}<span class="text-base-content/60 text-sm font-normal">({imageCount} / {MAX_IMAGES})</span>{/if}
			</h2>
			{#if editing}
				<ImageEditor source={editing} onapply={applyEdit} oncancel={() => (editing = null)} />
			{:else}
				{#if preview}
					<ul
						class="flex flex-wrap items-start gap-3"
						aria-label="Images"
						use:sortable={{ onmove: reorder, disabled: galleryLocked || promoting }}
					>
						<li class="flex flex-col items-center gap-1" data-sort-index={0}>
							<img
								src={preview}
								alt="Couverture"
								class="rounded-box ring-primary size-24 object-cover shadow-sm ring-2 ring-offset-2"
								onload={readShape}
							/>
							<span class="badge badge-primary badge-xs">Couverture</span>
							{@render controls(1, {
								remove: removeImage,
								removeDisabled: galleryLocked,
								forward: gallery.length ? () => makeCover(0) : undefined,
								forwardDisabled: galleryLocked || promoting
							})}
						</li>
						{#if galleryLoading}
							<li class="flex size-20 items-center justify-center"><span class="loading loading-dots loading-sm"></span></li>
						{/if}
						{#each gallery as item, i (item.url)}
							<li class="flex flex-col items-center gap-1" data-sort-index={i + 1}>
								<img src={item.url} alt="Image {i + 2}" class="rounded-box size-20 object-cover shadow-sm" />
								{@render controls(i + 2, {
									back: () => (i === 0 ? makeCover(0) : moveInGallery(i, i - 1)),
									backDisabled: i === 0 && promoting,
									remove: () => removeFromGallery(i),
									forward: i < gallery.length - 1 ? () => moveInGallery(i, i + 1) : undefined
								})}
							</li>
						{/each}
					</ul>
					{#if galleryFailed}
						<p class="text-base-content/60 text-xs">Les autres images n'ont pas pu être chargées : elles restent telles quelles.</p>
					{:else if galleryMissing}
						<p role="status" class="text-warning text-xs">
							{galleryMissing} image(s) illisible(s) ou absente(s) : retirée(s) si vous modifiez les images.
						</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						<button type="button" class="btn btn-outline btn-primary btn-sm" disabled={openingEditor} onclick={openEditor}>
							{#if openingEditor}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon name="crop" class="size-4" />{/if}
							Recadrer ou pivoter la couverture
						</button>
					</div>
					{#if shape === 'tall' || shape === 'wide'}
						<!-- Cadrage : la carte carrée ne montre qu'une partie de la couverture ; on choisit laquelle. -->
						<div class="flex items-center gap-4">
							<img
								class="rounded-box size-24 shrink-0 object-cover shadow-sm {framingClass(framing)}"
								src={preview}
								alt="Aperçu de la carte"
							/>
							<label class="flex min-w-0 flex-1 flex-col gap-1">
								<span class="text-sm font-medium">Cadrage de la carte</span>
								<input
									type="range"
									class="range range-primary range-sm"
									min="0"
									max="100"
									step={FRAMING_STEP}
									bind:value={framing}
								/>
								<span class="text-base-content/60 flex justify-between text-xs" aria-hidden="true">
									<span>{shape === 'tall' ? 'Haut' : 'Gauche'}</span>
									<span>{shape === 'tall' ? 'Bas' : 'Droite'}</span>
								</span>
							</label>
						</div>
					{/if}
				{/if}
				{#if imageCount < MAX_IMAGES}
					<div class="flex gap-2">
						<input
							type="file"
							accept="image/*"
							multiple
							class="file-input min-w-0 flex-1"
							aria-label="Ajouter des images"
							onchange={onFilesChosen}
						/>
						<button type="button" class="btn btn-outline btn-primary shrink-0" onclick={pasteImages}>
							<Icon name="copy" class="size-4" /> Coller
						</button>
					</div>
					<!-- Le texte collé par erreur ne reste pas : la zone ne sert qu'aux images. -->
					<input
						bind:this={pasteZone}
						type="text"
						inputmode="none"
						class="input input-sm w-full border-dashed text-center"
						placeholder="Ou appui long ici, puis « Coller »"
						aria-label="Zone de collage des images"
						autocomplete="off"
						oninput={(event) => (event.currentTarget.value = '')}
					/>
				{/if}
				<p class="text-base-content/60 text-xs">
					{#if preview}Ajoutées à la suite (fichiers, glisser-déposer ou Ctrl+V) ; glissez une image (appui long au doigt) ou utilisez les flèches pour changer l'ordre ; la première sert de couverture.
					{:else}Choisissez, glissez ou collez une ou plusieurs images : la première sert de couverture.{/if}
					Redimensionnées et chiffrées sur cet appareil avant l'envoi.
				</p>
			{/if}
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
				<TagPicker tags={collectionTags} groups={entries.tagGroupsIn(collectionId)} bind:selected={tagIds} label="Tags de la fiche" single />
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
			<h2 class="card-title text-base"><Icon name="link" /> Liens</h2>
			{#if activeSites.length}
				<p class="text-base-content/60 text-xs">
					Sites de la collection : laissez le terme vide pour chercher le nom de la fiche, ou saisissez un terme, un
					chemin (model/name) ou l'adresse d'une page du site. Ceux « sur demande » ne s'affichent que si vous les
					activez ici.
				</p>
				{#each activeSites as site (site.id)}
					{@const shown = siteShown({ hiddenSites, shownSites }, site)}
					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							checked={shown}
							onchange={() => toggleSite(site)}
							aria-label="Afficher {site.label} sur cette fiche"
							title="Afficher sur cette fiche"
						/>
						<label class="input input-sm min-w-0 flex-1">
							<span class="label" title={site.optIn ? 'Sur demande : à activer sur la fiche' : undefined}>{site.label}</span>
							<input
								placeholder={name}
								aria-label="Terme à chercher sur {site.label}"
								disabled={!shown}
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

	<ErrorAlert message={loadError} />
	<!-- Dans le formulaire : ses boutons restent des boutons d'envoi. L'erreur s'affiche au-dessus d'eux, à portée. -->
	<ActionBar label="Actions de la fiche">
		<ErrorAlert message={form.error} />
		<div class="flex gap-2">
			<button class="btn btn-primary flex-1 sm:flex-none" disabled={form.busy} onclick={() => (thenNext = false)}>
				{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Enregistrement…{:else}<Icon name="save" class="size-4" /> Enregistrer{/if}
			</button>
			{#if onnext}
				<button
					class="btn btn-outline btn-primary"
					disabled={form.busy}
					aria-label="Et une autre fiche"
					title="Enregistrer et créer une autre fiche"
					onclick={() => (thenNext = true)}
				>
					<Icon name="saveMore" class="size-4" /> <span class="hidden sm:inline">Et une autre</span>
				</button>
			{/if}
			<a class="btn btn-ghost" href={cancelHref}>Annuler</a>
		</div>
	</ActionBar>
</form>
