<script lang="ts">
	// Compare une liste de noms collée à la collection active : garde les absents, montre ceux qui existent déjà.
	// Tout reste dans la page : rien n'est enregistré ni envoyé.
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { compareNames, searchKey } from '$lib/entries/model';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	let text = $state('');
	let sorted = $state(true);

	loadEntries().catch((e) => (error = errorMessage(e)));

	// Fiches de la collection (cachées comprises, corbeille exclue), par nom sans casse ni accents.
	const byKey = $derived(new Map((entries.activeItems ?? []).map((item) => [searchKey(item.name), item])));
	const result = $derived(compareNames(text, (key) => byKey.get(key), sorted));
</script>

{#if entries.active}
	<CollectionHeader>
		{#snippet actions()}
			<a class="btn btn-ghost btn-sm shrink-0" href="/list"><Icon name="back" class="size-4" /> Index</a>
		{/snippet}
	</CollectionHeader>
	<h2 class="mb-4 text-xl font-bold">Comparer une liste</h2>
{:else}
	<h1 class="mb-4 text-2xl font-bold">Comparer une liste</h1>
{/if}

<ErrorAlert message={error} />

<div class="card bg-base-100 mb-4 shadow-sm">
	<div class="card-body gap-3">
		<p class="text-base-content/70 text-sm">
			Collez des noms, un par ligne : ceux qui ne sont pas encore dans <strong>{entries.active?.name ?? '…'}</strong>
			sont gardés, ceux qui y sont déjà sont signalés (sans tenir compte de la casse ni des accents, fiches cachées
			comprises, corbeille exclue).
		</p>
		<textarea
			class="textarea w-full"
			rows="8"
			placeholder="Un nom par ligne"
			aria-label="Noms à comparer"
			spellcheck="false"
			bind:value={text}
		></textarea>
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" class="toggle toggle-sm toggle-primary" bind:checked={sorted} />
			Trier par ordre alphabétique
		</label>
	</div>
</div>

{#if result.missing.length || result.found.length}
	<section class="card bg-base-100 mb-4 shadow-sm" aria-labelledby="missing-title">
		<div class="card-body gap-2">
			<div class="flex items-center gap-2">
				<h3 id="missing-title" class="flex-1 font-semibold">Absents de la collection ({result.missing.length})</h3>
				{#if result.missing.length}
					<CopyButton text={result.missing.join('\n')} label="Copier les absents" />
				{/if}
			</div>
			{#if result.missing.length}
				<ul class="divide-base-200 max-h-96 divide-y overflow-y-auto text-sm">
					{#each result.missing as name (name)}<li class="py-1.5">{name}</li>{/each}
				</ul>
			{:else}
				<p class="text-base-content/60 text-sm">Tous ces noms sont déjà dans la collection.</p>
			{/if}
		</div>
	</section>

	{#if result.found.length}
		<section class="card bg-base-100 mb-4 shadow-sm" aria-labelledby="found-title">
			<div class="card-body gap-2">
				<h3 id="found-title" class="font-semibold">Déjà dans la collection ({result.found.length})</h3>
				<ul class="divide-base-200 max-h-96 divide-y overflow-y-auto text-sm">
					{#each result.found as { name, entry } (entry.id)}
						<li class="flex items-center gap-2 py-1.5">
							<Icon name="check" class="text-success size-4 shrink-0" />
							<a class="link-hover min-w-0 flex-1 truncate" href="/entry/{entry.id}">{entry.name}</a>
							{#if name !== entry.name}<span class="text-base-content/50 shrink-0 text-xs">saisi « {name} »</span>{/if}
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	{#if result.duplicates}
		<p class="text-base-content/60 text-xs">
			{result.duplicates} doublon{result.duplicates > 1 ? 's' : ''} retiré{result.duplicates > 1 ? 's' : ''} de la liste.
		</p>
	{/if}
{/if}
