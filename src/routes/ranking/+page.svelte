<script lang="ts">
	// Gestion du classement de la collection active : fiches dans l'ordre, lancement des duels (voir duel/+page.svelte).
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import UnrankConfirm from '$lib/components/UnrankConfirm.svelte';
	import { rememberEntryNav, restoreEntryNavScroll } from '$lib/entries/entryNav.svelte';
	import { isRankable } from '$lib/entries/model';
	import {
		type ListItem,
		abandonNewRanking,
		deleteRanking,
		entries,
		finishNewRanking,
		loadEntries,
		selectCollection,
		startNewRanking
	} from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	let busy = $state(false);
	let confirmId = $state<string | null>(null);
	// Action en attente de confirmation : supprimer le classement, ou abandonner le nouveau.
	let confirmAction = $state<'delete' | 'abandon' | null>(null);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const collection = $derived(entries.active);
	const ranked = $derived(collection ? entries.ranking(collection.id).flatMap((id) => entries.find(id) ?? []) : []);
	const unranked = $derived(collection ? entries.unranked(collection.id) : []);
	const draft = $derived(collection ? entries.rankingDraft(collection.id) : null);
	const withoutImage = $derived((entries.activeItems ?? []).filter((item) => !isRankable(item)).length);

	// La fiche ouverte navigue dans le classement, puis les fiches à classer.
	beforeNavigate(({ to }) => {
		if (to?.route.id === '/entry/[id]')
			rememberEntryNav([...ranked, ...(draft ? [] : unranked)].map((item) => item.id), '/ranking', 'Classement');
	});
	afterNavigate(({ from }) => {
		if (from?.route.id?.startsWith('/entry/[id]')) restoreEntryNavScroll('/ranking');
	});

	async function run(action: () => Promise<unknown>) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await action();
			confirmAction = null;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

{#snippet row(item: ListItem, rank?: number)}
	<li class="bg-base-100 rounded-box flex flex-col gap-2 p-2 shadow-sm">
		<div class="flex items-center gap-2">
			{#if rank}<span class="badge badge-sm badge-neutral shrink-0">#{rank}</span>{/if}
			<img src={item.thumbUrl} alt="" class="rounded-box size-10 shrink-0 object-cover" />
			<a class="link-hover min-w-0 flex-1 truncate text-sm font-semibold" href="/entry/{item.id}">{item.name}</a>
			{#if !draft}
				<a
					class="btn btn-ghost btn-sm btn-square shrink-0"
					href="/ranking/duel?id={item.id}"
					aria-label="{rank ? 'Reclasser' : 'Classer'} {item.name}"
					title={rank ? 'Reclasser' : 'Classer'}
				>
					<Icon name="podium" class="size-4" />
				</a>
			{/if}
			{#if rank && confirmId !== item.id}
				<button
					class="btn btn-ghost btn-sm btn-square shrink-0"
					aria-label="Retirer {item.name} du classement"
					title="Retirer du classement"
					onclick={() => (confirmId = item.id)}
				>
					<Icon name="close" class="size-4" />
				</button>
			{/if}
		</div>
		{#if confirmId === item.id}
			<UnrankConfirm entry={item} onclose={() => (confirmId = null)} />
		{/if}
	</li>
{/snippet}

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>

<h1 class="mb-3 text-2xl font-bold">Classement</h1>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if !collection}
	<p class="alert alert-info alert-soft">Aucune collection.</p>
{:else}
	{#if (entries.collections?.length ?? 0) > 1}
		<select
			class="select select-sm mb-3 w-full"
			aria-label="Collection"
			value={collection.id}
			onchange={(event) => selectCollection(event.currentTarget.value)}
		>
			{#each entries.collections ?? [] as option (option.id)}
				<option value={option.id}>{option.name}</option>
			{/each}
		</select>
	{/if}
	<p class="text-base-content/60 mb-3 text-sm">
		{collection.name} · {ranked.length} classée{ranked.length > 1 ? 's' : ''}{draft ? '' : `, ${unranked.length} à classer`}{withoutImage
			? ` · ${withoutImage} sans image, non classable${withoutImage > 1 ? 's' : ''}`
			: ''}
	</p>
	{#if draft}
		<div role="status" class="alert alert-info alert-soft mb-4 flex flex-col items-stretch gap-2">
			<p class="text-sm">
				<strong>Nouveau classement en cours :</strong>
				{draft.length} classée{draft.length > 1 ? 's' : ''}, {unranked.length} à classer. Le classement actuel reste
				affiché jusqu'à la fin.
			</p>
			{#if confirmAction === 'abandon'}
				<p class="text-sm">Abandonner ce nouveau classement ? Ses duels seront perdus, le classement actuel ne change pas.</p>
				<div class="flex flex-wrap gap-2">
					<button class="btn btn-warning btn-sm" disabled={busy} onclick={() => run(() => abandonNewRanking(collection.id))}>Abandonner</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (confirmAction = null)}>Annuler</button>
				</div>
			{:else}
				<div class="flex flex-wrap gap-2">
					<a class="btn btn-primary btn-sm" href="/ranking/duel"><Icon name="podium" class="size-4" /> Continuer</a>
					{#if draft.length}
						<button class="btn btn-sm" disabled={busy} onclick={() => run(() => finishNewRanking(collection.id))}>
							Terminer maintenant
						</button>
					{/if}
					<button class="btn btn-ghost btn-sm" onclick={() => (confirmAction = 'abandon')}>Abandonner</button>
				</div>
			{/if}
		</div>
	{:else}
		{#if unranked.length}
			<a class="btn btn-primary mb-4" href="/ranking/duel"><Icon name="podium" class="size-4" /> Lancer le classement ({unranked.length})</a>
		{:else if ranked.length}
			<p class="alert alert-success alert-soft mb-4">Toutes les fiches avec image sont classées.</p>
		{:else}
			<p class="alert alert-info alert-soft">Aucune fiche avec image dans cette collection : seules les fiches avec image se classent.</p>
		{/if}
		{#if ranked.length}
			{#if confirmAction === 'delete'}
				<div role="alert" class="alert alert-warning alert-soft mb-4 flex flex-wrap items-center gap-2">
					<span class="flex-1 text-sm">Supprimer ce classement ? Toutes les fiches redeviendront non classées, il faudra refaire les duels.</span>
					<button class="btn btn-warning btn-sm" disabled={busy} onclick={() => run(() => deleteRanking(collection.id))}>Supprimer</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (confirmAction = null)}>Annuler</button>
				</div>
			{:else}
				<div class="mb-4 flex flex-wrap gap-2">
					<button
						class="btn btn-outline btn-sm"
						disabled={busy}
						onclick={() => run(async () => (await startNewRanking(collection.id), await goto('/ranking/duel')))}
					>
						Relancer le classement
					</button>
					<button class="btn btn-ghost btn-sm text-error" onclick={() => (confirmAction = 'delete')}>Supprimer le classement</button>
				</div>
			{/if}
		{/if}
	{/if}

	{#if ranked.length}
		<ol class="mb-4 flex flex-col gap-2">
			{#each ranked as item, i (item.id)}
				{@render row(item, i + 1)}
			{/each}
		</ol>
	{/if}
	{#if unranked.length && !draft}
		<h2 class="mb-2 font-semibold">À classer</h2>
		<ul class="flex flex-col gap-2">
			{#each unranked as item (item.id)}
				{@render row(item)}
			{/each}
		</ul>
	{/if}
{/if}
