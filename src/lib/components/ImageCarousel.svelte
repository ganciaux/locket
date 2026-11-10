<script lang="ts">
	// Images d'une fiche (couverture puis autres images, voir gallery.ts) en carrousel, sur la fiche et dans la fiche
	// agrandie. Défilement natif accroché à chaque image (glisser au doigt, molette, points) : glisser sur les images
	// change d'image, ailleurs de fiche (`data-no-swipe`). Les vignettes servent d'attente, l'image complète est chargée
	// à l'approche. Tout est déchiffré ici et libéré au démontage : à monter dans un `{#key}` par fiche.
	import { onDestroy, type Snippet, untrack } from 'svelte';
	import { session } from '$lib/auth/session.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { bytesToUrl } from '$lib/entries/images';
	import { galleryImageId } from '$lib/entries/gallery';
	import { getGalleryThumbs, getImage } from '$lib/entries/repository';
	import type { BorderColor, Entry } from '$lib/entries/types';

	let {
		entry,
		cover,
		imageClass,
		border,
		onfail
	}: {
		entry: Pick<Entry, 'id' | 'name' | 'gallery'>;
		/** La couverture, telle que la page l'affiche sans carrousel. */
		cover: Snippet;
		/** Classes des autres images (mêmes dimensions que la couverture). */
		imageClass: string;
		border?: BorderColor;
		onfail: (error: unknown) => void;
	} = $props();

	// Fixées au montage : la page remonte le carrousel quand la fiche change.
	// svelte-ignore state_referenced_locally
	const { id, name } = entry;
	// svelte-ignore state_referenced_locally
	const types = entry.gallery ?? [];
	const count = types.length + 1;

	let track = $state<HTMLElement>();
	let active = $state(0);
	let thumbs = $state<string[]>([]);
	// Images complètes par position (1 à 5) ; `null` : demandée, en cours ou introuvable.
	let full = $state<Record<number, string | null>>({});
	const created: string[] = [];
	let alive = true;

	const keep = (url: string) => (created.push(url), url);

	if (types.length) {
		const { user, dek } = session;
		if (user && dek)
			getGalleryThumbs(user.uid, dek, id).then(
				(list) => {
					if (alive) thumbs = list.slice(0, types.length).map(({ type, bytes }) => keep(bytesToUrl(bytes, type)));
				},
				(e) => alive && onfail(e)
			);
	}

	onDestroy(() => {
		alive = false;
		clearTimeout(settle);
		created.forEach((url) => URL.revokeObjectURL(url));
	});

	/** Image complète de la position `index`, une seule fois. */
	async function load(index: number) {
		const { user, dek } = session;
		if (index < 1 || index >= count || index in full || !user || !dek) return;
		full[index] = null;
		try {
			const bytes = await getImage(user.uid, dek, galleryImageId(id, index));
			if (!alive) return;
			if (!bytes) throw new Error('Image introuvable.');
			full[index] = keep(bytesToUrl(bytes, types[index - 1] ?? 'image/jpeg'));
		} catch (e) {
			if (alive) onfail(e);
		}
	}

	// L'image affichée et la suivante : prêtes avant qu'on y arrive.
	$effect(() => {
		const index = active;
		untrack(() => {
			load(index);
			load(index + 1);
		});
	});

	// Image visée par une flèche ou un point, le temps du défilement animé : deux appuis rapides avancent de deux images.
	// Oubliée une fois arrivé, ou dès que le défilement s'arrête ailleurs (doigt qui reprend la main).
	let goal = $state<number | null>(null);
	const current = $derived(goal ?? active);
	let settle: ReturnType<typeof setTimeout> | undefined;

	function onScroll() {
		if (!track) return;
		active = Math.round(track.scrollLeft / track.clientWidth);
		if (active === goal) goal = null;
		clearTimeout(settle);
		settle = setTimeout(() => (goal = null), 200);
	}

	function go(index: number) {
		goal = index;
		track?.scrollTo({ left: index * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	}
</script>

{#if count === 1}
	{@render cover()}
{:else}
	<div class="flex w-full flex-col">
		<div class="relative">
			<div
				bind:this={track}
				class="flex snap-x snap-mandatory items-center overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
				data-no-swipe
				onscroll={onScroll}
			>
				<div class="flex w-full shrink-0 snap-center snap-always justify-center">{@render cover()}</div>
				{#each types as _, i (i)}
					{@const url = full[i + 1] ?? thumbs[i]}
					<div class="flex w-full shrink-0 snap-center snap-always justify-center">
						{#if url}
							<img src={url} alt="{name}, image {i + 2}" data-border={border} class={imageClass} />
						{:else}
							<span class="loading loading-spinner text-primary my-16"></span>
						{/if}
					</div>
				{/each}
			</div>
			<!-- Flèches sombres et translucides, au bord de l'image : on voit la photo au travers ; absentes aux extrémités. -->
			{#if current > 0}
				<button type="button" class="carousel-arrow left-2" aria-label="Image précédente de {name}" onclick={() => go(current - 1)}>
					<Icon name="chevronLeft" class="size-5" />
				</button>
			{/if}
			{#if current < count - 1}
				<button type="button" class="carousel-arrow right-2" aria-label="Image suivante de {name}" onclick={() => go(current + 1)}>
					<Icon name="chevronRight" class="size-5" />
				</button>
			{/if}
		</div>
		<ul class="flex justify-center pt-1" aria-label="Images de la fiche">
			{#each { length: count }, i (i)}
				<li>
					<button
						type="button"
						class="flex size-6 cursor-pointer items-center justify-center"
						aria-label="Afficher l'image {i + 1} de {name}"
						aria-pressed={active === i}
						onclick={() => go(i)}
					>
						<span class="rounded-full transition-all {active === i ? 'bg-primary h-2 w-4' : 'bg-base-content/30 size-2'}"></span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}
