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

	// Les fiches existantes servent à écarter les doublons.
	loadEntries().catch((e) => (error = errorMessage(e)));

	const parsed = $derived(parseNameList(text, (entries.items ?? []).map((item) => item.name)));

	async function readFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) text = await file.text();
	}

	const form = formAction(async () => {
		const { user, dek } = session;
		if (!user || !dek) throw new Error('Session verrouillée.');
		if (!entries.items) throw new Error('Fiches existantes pas encore chargées.');
		upsertEntries(await createEntries(user.uid, dek, parsed.names));
		await goto('/', { replaceState: true });
	});
</script>

<h1 class="mb-4 text-2xl font-bold">Importer des fiches</h1>

<ErrorAlert message={error} />

<form class="card bg-base-100 shadow-sm" onsubmit={form.submit}>
	<div class="card-body gap-4">
		<p class="text-base-content/70 text-sm">
			Un nom par ligne : chaque nom devient une fiche, sans lien ni image, que vous pourrez compléter ensuite.
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
			<p role="status" class="text-sm">
				<strong>{parsed.names.length}</strong> fiche{parsed.names.length > 1 ? 's' : ''} à créer
				{#if parsed.duplicates}
					<span class="text-base-content/60">
						· {parsed.duplicates} doublon{parsed.duplicates > 1 ? 's' : ''} ignoré{parsed.duplicates > 1 ? 's' : ''}
					</span>
				{/if}
			</p>
		{/if}

		<ErrorAlert message={form.error} />
		<div class="flex gap-2">
			<button class="btn btn-primary flex-1 sm:flex-none" disabled={form.busy || !entries.items || !parsed.names.length}>
				{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Import…{:else}Importer{/if}
			</button>
			<a class="btn btn-ghost" href="/">Annuler</a>
		</div>
	</div>
</form>
