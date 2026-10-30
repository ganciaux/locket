<script lang="ts">
	// Import d'une liste de noms : une fiche (sans lien ni image) par ligne.
	import { goto } from '$app/navigation';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import { parseNameList } from '$lib/entries/model';
	import { createEntries } from '$lib/entries/repository';
	import { entries, loadEntries, upsertEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let text = $state('');
	let error = $state('');

	// Les fiches de la collection servent à écarter les doublons : un même nom peut exister ailleurs.
	loadEntries().catch((e) => (error = errorMessage(e)));

	const parsed = $derived(parseNameList(text, (entries.activeItems ?? []).map((item) => item.name)));

	async function readFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) text = await file.text();
	}

	const form = formAction(async () => {
		const { user, dek } = session;
		if (!user || !dek) throw new Error('Session verrouillée.');
		if (!entries.activeItems) throw new Error('Fiches existantes pas encore chargées.');
		if (!entries.active) throw new Error('Créez d’abord une collection.');
		upsertEntries(await createEntries(user.uid, dek, entries.active.id, parsed.names));
		await goto('/', { replaceState: true });
	});
</script>

<h1 class="mb-4 text-2xl font-bold">Importer des fiches</h1>

<ErrorAlert message={error} />

<form class="card bg-base-100 shadow-sm" onsubmit={form.submit}>
	<div class="card-body gap-4">
		<p class="text-base-content/70 text-sm">
			Un nom par ligne : chaque nom devient une fiche de la collection
			<strong>{entries.active?.name ?? '…'}</strong>, sans lien ni image, que vous pourrez compléter ensuite.
		</p>

		<Field label="Noms">
			<textarea
				class="textarea h-56 w-full font-mono"
				placeholder={'Banque\nImpôts\nMutuelle'}
				spellcheck="false"
				bind:value={text}
			></textarea>
		</Field>

		<Field label="Ou depuis un fichier texte">
			<input type="file" accept=".txt,.csv,text/plain" class="file-input file-input-sm w-full" onchange={readFile} />
		</Field>

		{#if text.trim()}
			{@const count = parsed.duplicates.length}
			<p role="status" class="text-sm">
				<strong>{parsed.names.length}</strong> fiche{parsed.names.length > 1 ? 's' : ''} à créer
			</p>
			{#if count}
				<!-- Doublons nommés : déjà dans la collection, ou répétés dans la liste (casse et accents ignorés). -->
				<details class="bg-base-200 rounded-box text-sm" open={count <= 5}>
					<summary class="cursor-pointer px-3 py-2">
						{count} doublon{count > 1 ? 's' : ''} ignoré{count > 1 ? 's' : ''}
					</summary>
					<ul class="flex flex-wrap gap-1 px-3 pb-3">
						{#each parsed.duplicates as name, i (i)}
							<li class="badge badge-ghost">{name}</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}

		<ErrorAlert message={form.error} />
		<div class="flex gap-2">
			<button class="btn btn-primary flex-1 sm:flex-none" disabled={form.busy || !entries.active || !parsed.names.length}>
				{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Import…{:else}Importer{/if}
			</button>
			<a class="btn btn-ghost" href="/">Annuler</a>
		</div>
	</div>
</form>
