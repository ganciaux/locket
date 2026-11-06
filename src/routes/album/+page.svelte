<script lang="ts">
	// Album de la collection active (voir album.ts) : toutes les fiches face cachée, par classement, découvertes une à
	// une par le dé (jamais une déjà découverte). La carte tirée se révèle dans la fiche agrandie, qui en se refermant
	// rejoint son emplacement ; la carte s'y retourne. On ne fait que regarder : ni ouvrir, ni modifier, ni noter.
	import { tick } from 'svelte';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import ConfirmInline from '$lib/components/ConfirmInline.svelte';
	import EntryZoom from '$lib/components/EntryZoom.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import { discoverInAlbum, resetAlbum } from '$lib/entries/collections';
	import { albumOrder, discoveredIn, framingClass, pickHidden } from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	loadEntries().catch((e) => (error = errorMessage(e)));

	const collection = $derived(entries.active);
	const cards = $derived(collection ? albumOrder(entries.activeItems ?? [], entries.ranking(collection.id)) : []);
	const ids = $derived(cards.map((card) => card.id));
	const discovered = $derived(discoveredIn(collection?.discovered, ids));
	const count = $derived(discovered.size);
	const complete = $derived(cards.length > 0 && count === cards.length);

	// Carte tirée pas encore retournée dans l'album : elle reste face cachée jusqu'à la fermeture de la fiche agrandie.
	let pending = $state<string | null>(null);
	let zoom = $state<{ id: string; ids: string[]; draw: number } | null>(null);
	let drawing = $state(false);
	let draws = 0;
	let confirmReset = $state(false);

	const faceUp = (id: string) => discovered.has(id) && pending !== id;

	async function draw() {
		if (!collection || drawing) return;
		const id = pickHidden(ids, discovered);
		if (!id) return;
		drawing = true;
		error = '';
		try {
			// Enregistrée d'abord : un tirage affiché est un tirage gardé, sur tous les appareils.
			await discoverInAlbum(collection.id, id, ids);
			pending = id;
			zoom = { id, ids: [id], draw: ++draws };
		} catch (e) {
			error = errorMessage(e);
		} finally {
			drawing = false;
		}
	}

	/** Une autre carte depuis la fiche agrandie : la précédente se retourne derrière, sans attendre. */
	function reroll() {
		pending = null;
		draw();
	}

	/** La fiche agrandie a rejoint l'emplacement : la carte s'y retourne (un demi-tour face cachée, un demi-tour face visible). */
	async function closeZoom() {
		// Le dialogue peut le signaler deux fois (fin de l'animation, puis son événement `close`).
		if (!zoom) return;
		zoom = null;
		const id = pending;
		if (!id) return;
		const card = document.getElementById(`card-${id}`);
		if (!card || matchMedia('(prefers-reduced-motion: reduce)').matches) {
			pending = null;
			return;
		}
		const turn = (from: number, to: number, easing: string) =>
			card.animate(
				[{ transform: `perspective(600px) rotateY(${from}deg)` }, { transform: `perspective(600px) rotateY(${to}deg)` }],
				{ duration: 180, easing }
			).finished;
		await turn(0, 90, 'ease-in');
		pending = null;
		await tick();
		await turn(-90, 0, 'ease-out');
	}

	/** Une carte découverte : agrandie pour la regarder, en parcourant les autres découvertes. */
	function look(id: string) {
		zoom = { id, ids: ids.filter((other) => faceUp(other)), draw: 0 };
	}
</script>

<CollectionHeader />
<h2 class="mb-1 text-xl font-bold">Album</h2>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<PageSpinner />
{:else if !collection}
	<p class="alert alert-info alert-soft">Aucune collection.</p>
{:else if !cards.length}
	<p class="alert alert-info alert-soft">Aucune fiche dans cette collection : l'album se remplira avec elles.</p>
{:else}
	<div class="mb-4 flex flex-col gap-2">
		<div class="flex items-center gap-3">
			<progress class="progress progress-primary flex-1" value={count} max={cards.length} aria-label="Cartes découvertes"></progress>
			<span class="text-sm font-medium tabular-nums" role="status">{count} / {cards.length}</span>
		</div>
		<p class="text-base-content/60 text-xs">
			Toutes les fiches de {collection.name}, face cachée, dans l'ordre du classement. Le dé en découvre une à chaque
			tirage, jamais deux fois la même.
		</p>
	</div>

	{#if complete}
		<div role="status" class="alert alert-success alert-soft mb-4">
			<Icon name="check" class="size-5" />
			<span>Album complet : toutes les fiches de {collection.name} sont découvertes.</span>
		</div>
	{/if}

	<ul class="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Cartes de l'album">
		{#each cards as card, i (card.id)}
			<li id="card-{card.id}" class="aspect-square">
				{#if faceUp(card.id)}
					<button
						type="button"
						class="size-full cursor-pointer"
						aria-label="Voir {card.name}"
						title={card.name}
						onclick={() => look(card.id)}
					>
						<figure
							data-border={entries.borderOf(card)}
							class="frame-thin bg-primary/10 rounded-box flex size-full items-center justify-center overflow-hidden"
						>
							{#if card.thumbUrl}
								<img src={card.thumbUrl} alt="" class="size-full object-cover {framingClass(card.framing)}" />
							{:else}
								<span class="text-primary text-2xl font-bold" aria-hidden="true">{card.name.charAt(0).toUpperCase()}</span>
							{/if}
						</figure>
					</button>
				{:else}
					<figure class="album-back rounded-box flex size-full items-center justify-center" role="img" aria-label="Carte {i + 1}, face cachée">
						<img src="/logo-256.png" alt="" class="size-1/2 opacity-30 drop-shadow" />
					</figure>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="mt-6">
		{#if confirmReset}
			<ConfirmInline
				tone="warning"
				message="Toutes les cartes repartent face cachée."
				confirmLabel="Recommencer"
				onconfirm={async () => {
					await resetAlbum(collection.id);
					confirmReset = false;
				}}
				oncancel={() => (confirmReset = false)}
			/>
		{:else if count}
			<button class="btn btn-ghost btn-sm" onclick={() => (confirmReset = true)}>Recommencer l'album</button>
		{/if}
	</div>

	{#if !complete}
		<!-- Toujours à portée, même en bas d'un long album. -->
		<button
			class="btn btn-primary btn-circle btn-lg fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 shadow-lg"
			aria-label="Tirer une carte"
			title="Tirer une carte"
			disabled={drawing}
			onclick={draw}
		>
			{#if drawing}<span class="loading loading-spinner"></span>{:else}<Icon name="dice" class="size-7" />{/if}
		</button>
	{/if}
{/if}

{#if zoom}
	<EntryZoom
		id={zoom.id}
		ids={zoom.ids}
		draw={zoom.draw}
		readonly
		onchange={(id) => zoom && (zoom = { ...zoom, id })}
		onclose={closeZoom}
		onreroll={zoom.draw && !complete ? reroll : undefined}
	/>
{/if}
