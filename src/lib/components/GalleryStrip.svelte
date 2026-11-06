<script lang="ts">
	// Bande des images d'une fiche (couverture puis autres images, voir gallery.ts), sous l'image de la fiche : un clic
	// affiche l'image choisie à la place. Les autres images sont téléchargées et déchiffrées ici, libérées au démontage.
	import { untrack } from 'svelte';
	import { session } from '$lib/auth/session.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { getGalleryImages } from '$lib/entries/repository';
	import type { Entry } from '$lib/entries/types';

	let {
		entry,
		thumbUrl,
		shown,
		onshow,
		onfail
	}: {
		entry: Pick<Entry, 'id' | 'name' | 'gallery'>;
		thumbUrl?: string;
		/** Image affichée : null pour la couverture, sinon l'URL d'une autre image. */
		shown: string | null;
		onshow: (url: string | null) => void;
		onfail: (error: unknown) => void;
	} = $props();

	let urls = $state<string[]>([]);
	// Rechargées seulement si la fiche ou ses images changent : noter la fiche remplace l'objet, pas les images.
	const source = $derived({ id: entry.id, types: entry.gallery ?? [] });
	const key = $derived(`${source.id}:${source.types.join()}`);

	$effect(() => {
		void key;
		const { user, dek } = session;
		const { id, types } = untrack(() => source);
		if (!user || !dek || !types.length) return;
		let current: string[] = [];
		let cancelled = false;
		getGalleryImages(user.uid, dek, { id, gallery: types }).then(
			(images) => {
				if (cancelled) return;
				current = images.flatMap((bytes, i) => (bytes ? [bytesToUrl(bytes, types[i])] : []));
				urls = current;
			},
			(e) => onfail(e)
		);
		return () => {
			cancelled = true;
			current.forEach((url) => URL.revokeObjectURL(url));
			urls = [];
			onshow(null);
		};
	});
</script>

{#if urls.length}
	<!-- data-no-swipe : glisser fait défiler la bande, sans changer de fiche. -->
	<ul class="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 sm:px-6" aria-label="Images de la fiche" data-no-swipe>
		{#each [null, ...urls] as url, i (url ?? 'cover')}
			<li class="shrink-0">
				<button
					type="button"
					class="bg-base-200 rounded-box block size-14 cursor-pointer overflow-hidden {shown === url
						? 'outline-primary outline-2 outline-offset-2'
						: 'opacity-70 hover:opacity-100'}"
					aria-label="Afficher l'image {i + 1} de {entry.name}"
					aria-pressed={shown === url}
					onclick={() => onshow(url)}
				>
					{#if url ?? thumbUrl}<img src={url ?? thumbUrl} alt="" class="size-full object-cover" />{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}
