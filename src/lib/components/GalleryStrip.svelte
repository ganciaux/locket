<script lang="ts">
	// Bande des images d'une fiche (couverture puis autres images, voir gallery.ts), sous son image, sur la fiche et dans
	// la fiche agrandie. Vignettes lues en une fois (un document) ; un clic charge l'image complète et l'affiche à la
	// place (`onshow`). Tout est déchiffré ici et libéré au démontage.
	import { untrack } from 'svelte';
	import { session } from '$lib/auth/session.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { galleryImageId } from '$lib/entries/gallery';
	import { getGalleryThumbs, getImage } from '$lib/entries/repository';
	import type { Entry } from '$lib/entries/types';

	let {
		entry,
		thumbUrl,
		shown,
		onshow,
		onfail,
		class: className = ''
	}: {
		entry: Pick<Entry, 'id' | 'name' | 'gallery'>;
		thumbUrl?: string;
		/** Image affichée : 0 pour la couverture, n pour la n-ième autre image. */
		shown: number;
		onshow: (index: number, url: string | null) => void;
		onfail: (error: unknown) => void;
		class?: string;
	} = $props();

	let thumbs = $state<string[]>([]);
	let loadingIndex = $state<number | null>(null);
	// Images complètes déjà chargées, par position (1 à 5).
	let full = new Map<number, string>();
	let created: string[] = [];

	// Rechargées seulement si la fiche ou ses images changent : noter la fiche remplace l'objet, pas les images.
	const source = $derived({ id: entry.id, types: entry.gallery ?? [] });
	const key = $derived(`${source.id}:${source.types.join()}`);

	$effect(() => {
		void key;
		const { user, dek } = session;
		const { id, types } = untrack(() => source);
		if (!user || !dek || !types.length) return;
		let cancelled = false;
		getGalleryThumbs(user.uid, dek, id).then(
			(list) => {
				if (cancelled) return;
				thumbs = list.slice(0, types.length).map(({ type, bytes }) => track(bytesToUrl(bytes, type)));
			},
			(e) => onfail(e)
		);
		return () => {
			cancelled = true;
			created.forEach((url) => URL.revokeObjectURL(url));
			created = [];
			full = new Map();
			thumbs = [];
			loadingIndex = null;
			onshow(0, null);
		};
	});

	function track(url: string): string {
		created.push(url);
		return url;
	}

	async function show(index: number) {
		const { user, dek } = session;
		if (index === 0 || !user || !dek) return onshow(0, null);
		const cached = full.get(index);
		if (cached) return onshow(index, cached);
		loadingIndex = index;
		const id = entry.id;
		try {
			const bytes = await getImage(user.uid, dek, galleryImageId(id, index));
			if (id !== entry.id) return;
			if (!bytes) throw new Error('Image introuvable.');
			const url = track(bytesToUrl(bytes, entry.gallery?.[index - 1] ?? 'image/jpeg'));
			full.set(index, url);
			onshow(index, url);
		} catch (e) {
			onfail(e);
		} finally {
			if (loadingIndex === index) loadingIndex = null;
		}
	}
</script>

{#if thumbs.length}
	<!-- data-no-swipe : glisser fait défiler la bande, sans changer de fiche. -->
	<ul class="flex gap-2 overflow-x-auto pt-3 pb-1 {className}" aria-label="Images de la fiche" data-no-swipe>
		{#each [thumbUrl, ...thumbs] as url, i (i)}
			<li class="shrink-0">
				<button
					type="button"
					class="bg-base-200 rounded-box relative block size-14 cursor-pointer overflow-hidden {shown === i
						? 'outline-primary outline-2 outline-offset-2'
						: 'opacity-70 hover:opacity-100'}"
					aria-label="Afficher l'image {i + 1} de {entry.name}"
					aria-pressed={shown === i}
					onclick={() => show(i)}
				>
					{#if url}<img src={url} alt="" class="size-full object-cover" />{/if}
					{#if loadingIndex === i}
						<span class="loading loading-spinner loading-xs text-primary absolute inset-0 m-auto"></span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}
