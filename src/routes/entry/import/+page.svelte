<script lang="ts">
	// Import d'un tableau de fiches dans la collection active (voir importTable.ts) : saisie, aperçu, puis écriture.
	import { goto } from '$app/navigation';
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { CLEAR, type ImportPlan, importTagColumns, importTemplate, planImport, rowsText } from '$lib/entries/importTable';
	import { COUNTRY_CODES, countryName } from '$lib/entries/model';
	import { entries, importEntries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let text = $state('');
	let error = $state('');
	/** null : saisie ; sinon aperçu de ce qui sera écrit. */
	let plan = $state<ImportPlan | null>(null);
	/** Après un import sans les lignes en erreur : ce qui a été écrit, et ce qui reste à corriger. */
	let partial = $state<{ count: number; lines: number; errors: string[]; retry: string } | null>(null);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const tagColumns = $derived(importTagColumns(entries.tags ?? [], entries.tagGroups));
	const count = $derived(plan ? plan.added.length + plan.updated.length : 0);

	async function readFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (file) text = await file.text();
	}

	function verify() {
		plan = planImport(text, entries.activeItems ?? [], entries.tags ?? [], entries.tagGroups);
	}

	// Les lignes en erreur ne sont jamais dans le plan : les autres s'importent sans elles, puis restent à corriger.
	const form = formAction(async () => {
		if (!plan || !count) return;
		if (!entries.active) throw new Error('Créez d’abord une collection.');
		await importEntries(entries.active.id, plan);
		if (!plan.errors.length) return goto('/list', { replaceState: true });
		partial = { count, lines: plan.failed.length, errors: plan.errors, retry: rowsText(text, plan.failed) };
		plan = null;
	});

	// Codes ISO 3166-1 acceptés, par nom français, pour la légende.
	const countries = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
		a.name.localeCompare(b.name, 'fr')
	);

	const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
</script>

<!-- Import dans la collection active : son menu en en-tête permet d'en changer. -->
{#if entries.active}
	<CollectionHeader onselect={() => (plan = partial = null)}>
		{#snippet actions()}
			<a class="btn btn-ghost btn-sm shrink-0" href="/list"><Icon name="back" class="size-4" /> Index</a>
		{/snippet}
	</CollectionHeader>
	<h2 class="mb-4 text-xl font-bold">Importer des fiches</h2>
{:else}
	<h1 class="mb-4 text-2xl font-bold">Importer des fiches</h1>
{/if}

<ErrorAlert message={error} />

{#snippet rows(list: ImportPlan['added'], title: string)}
	{#if list.length}
		<details class="bg-base-200 rounded-box text-sm" open={list.length <= 20}>
			<summary class="cursor-pointer px-3 py-2 font-medium">{title}</summary>
			<ul class="divide-base-300 flex max-h-96 flex-col divide-y overflow-y-auto px-3 pb-2">
				{#each list as row (row.line)}
					<li class="py-1.5">
						<span class="font-medium">{row.name}</span>
						{#if row.changes.length}<span class="text-base-content/70 block text-xs">{row.changes.join(' · ')}</span>{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}

{#if plan}
	<form class="card bg-base-100 shadow-sm" onsubmit={form.submit}>
		<div class="card-body gap-4">
			<p role="status" class="text-sm">
				<strong>{plan.added.length}</strong> ajout{plan.added.length > 1 ? 's' : ''} ·
				<strong>{plan.updated.length}</strong> modification{plan.updated.length > 1 ? 's' : ''} ·
				{plural(plan.unchanged, 'fiche')} inchangée{plan.unchanged > 1 ? 's' : ''}
				{#if plan.errors.length}· <strong class="text-error">{plural(plan.errors.length, 'erreur')}</strong>{/if}
			</p>
			{#if plan.errors.length}
				<div class="alert alert-error alert-soft flex flex-col items-stretch gap-1">
					<p class="text-sm font-medium">
						{count ? 'Lignes en erreur, laissées de côté si vous importez sans elles :' : 'Rien ne peut être importé :'}
					</p>
					<ul class="max-h-60 list-disc overflow-y-auto pl-5 text-sm">
						{#each plan.errors as message, i (i)}<li>{message}</li>{/each}
					</ul>
				</div>
			{/if}
			{@render rows(plan.added, `Ajouts (${plan.added.length})`)}
			{@render rows(plan.updated, `Modifications (${plan.updated.length})`)}

			<ErrorAlert message={form.error} />
			<div class="flex flex-wrap gap-2">
				<button class="btn btn-primary flex-1 sm:flex-none" disabled={form.busy || !count}>
					{#if form.busy}
						<span class="loading loading-spinner loading-sm"></span> Import…
					{:else}
						{plan.errors.length ? 'Importer sans les erreurs' : 'Importer'} ({count})
					{/if}
				</button>
				<button type="button" class="btn btn-ghost" disabled={form.busy} onclick={() => (plan = null)}>
					<Icon name="edit" class="size-4" /> Modifier le tableau
				</button>
			</div>
		</div>
	</form>
{:else if partial}
	<div class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<p role="status" class="alert alert-success alert-soft text-sm">
				{plural(partial.count, 'fiche')} importée{partial.count > 1 ? 's' : ''}, {plural(partial.lines, 'ligne')} laissée{partial.lines > 1
					? 's'
					: ''} de côté :
			</p>
			<ul class="max-h-60 list-disc overflow-y-auto pl-5 text-sm">
				{#each partial.errors as message, i (i)}<li>{message}</li>{/each}
			</ul>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-primary flex-1 sm:flex-none"
					onclick={() => {
						text = partial?.retry ?? '';
						partial = null;
					}}
				>
					<Icon name="edit" class="size-4" /> Corriger les lignes ignorées
				</button>
				<a class="btn btn-ghost" href="/list">Voir l'index</a>
			</div>
		</div>
	</div>
{:else}
	<div class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<p class="text-base-content/70 text-sm">
				Un tableau : la première ligne donne les colonnes (seul « Nom » est obligatoire), puis une ligne par fiche,
				valeurs séparées par « ; ». Un nom déjà présent dans <strong>{entries.active?.name ?? '…'}</strong> met la fiche
				à jour, un nom inconnu la crée. Un aperçu s'affiche avant tout enregistrement.
			</p>

			<div class="flex flex-col gap-1">
				<div class="flex items-center gap-2">
					<label for="import-text" class="flex-1 text-sm font-medium">Tableau</label>
					{#if text.trim()}
						<CopyButton {text} label="Copier le tableau" class="btn btn-ghost btn-sm btn-square" />
						<button type="button" class="btn btn-ghost btn-sm" onclick={() => (text = '')}>Vider</button>
					{:else}
						<!-- Aller-retour avec un tableur : les fiches et leurs valeurs actuelles, à compléter puis recoller. -->
						<button
							type="button"
							class="btn btn-outline btn-primary btn-sm"
							disabled={!entries.activeItems}
							onclick={() => (text = importTemplate(entries.activeItems ?? [], entries.tags ?? [], entries.tagGroups))}
						>
							Partir de mes fiches
						</button>
					{/if}
				</div>
				<textarea
					id="import-text"
					class="textarea h-64 w-full font-mono text-xs"
					placeholder={'Nom;Pays;Naissance;Note\nNaruto;Japon;1999;4,5\nOne Piece;JP;;5'}
					spellcheck="false"
					wrap="off"
					bind:value={text}
				></textarea>
				<!-- Seule sortie en clair de l'app (SECURITY.md § 5) : voulue, mais à signaler. -->
				<p class="text-base-content/60 text-xs">
					Ce tableau est en clair : le presse-papiers et un tableur (surtout en ligne) peuvent en garder une copie.
					Supprimez-la une fois l'import fait.
				</p>
			</div>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-medium">Ou depuis un fichier (.csv, .txt)</span>
				<input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" class="file-input file-input-sm w-full" onchange={readFile} />
			</label>

			<details class="bg-base-200 rounded-box text-sm">
				<summary class="cursor-pointer px-3 py-2 font-medium">Colonnes et valeurs acceptées</summary>
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 pb-3">
					<dt class="font-medium">Nom</dt>
					<dd>Obligatoire. Comparé sans casse ni accents aux fiches de la collection.</dd>
					<dt class="font-medium">Pays</dt>
					<dd>
						Code ISO à 2 lettres (<code>FR</code>, <code>CZ</code>), nom en français (<code>France</code>) ou en anglais
						(<code>Germany</code>).
						<details class="mt-1">
							<summary class="link link-primary cursor-pointer">Voir les {countries.length} codes</summary>
							<ul class="mt-1 max-h-60 overflow-y-auto">
								{#each countries as country (country.code)}
									<li><code>{country.code}</code> {country.name}</li>
								{/each}
							</ul>
						</details>
					</dd>
					<dt class="font-medium">Naissance</dt>
					<dd>Année seule (<code>1990</code>).</dd>
					<dt class="font-medium">Note</dt>
					<dd>De 0,5 à 5 étoiles, par demi-étoile (<code>4,5</code>).</dd>
					{#each tagColumns as column (column.label)}
						<dt class="font-medium">{column.label}</dt>
						<dd>{column.values.join(', ')}</dd>
					{/each}
				</dl>
				<p class="text-base-content/70 px-3 pb-3 text-xs">
					Plusieurs tags d'une même colonne : séparés par des virgules. Case vide : valeur gardée ; <code>{CLEAR}</code> :
					valeur effacée. Une colonne de tags ne change que les tags de sa catégorie.
				</p>
			</details>

			<div class="flex gap-2">
				<button type="button" class="btn btn-primary flex-1 sm:flex-none" disabled={!entries.active || !entries.activeItems || !text.trim()} onclick={verify}>
					<Icon name="check" class="size-4" /> Vérifier
				</button>
				<a class="btn btn-ghost" href="/list">Annuler</a>
			</div>
		</div>
	</div>
{/if}
