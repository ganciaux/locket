<script lang="ts">
	// Sites d'une collection (page Liens) : un modèle d'URL devient un lien sur chacune de ses fiches.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		type Collection,
		MAX_LABEL_LENGTH,
		NAME_PLACEHOLDER,
		NOSPACE_PLACEHOLDER,
		type Site,
		type SiteMode,
		siteMode
	} from '$lib/entries/model';
	import { deleteSite, moveSite, saveSite, setSiteMode } from '$lib/entries/collections';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let { collection }: { collection: Collection } = $props();

	const MODES: { value: SiteMode; label: string }[] = [
		{ value: 'all', label: 'Toutes les fiches' },
		{ value: 'optIn', label: 'Sur demande' },
		{ value: 'off', label: 'Inutilisé' }
	];

	const sites = $derived(collection.sites ?? []);
	const activeCount = $derived(sites.filter((site) => site.enabled).length);

	let editId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);
	let label = $state('');
	let urlTemplate = $state('');
	let error = $state('');

	function reset() {
		editId = null;
		label = urlTemplate = '';
	}

	function edit(site: Site) {
		confirmId = null;
		editId = site.id;
		label = site.label;
		urlTemplate = site.urlTemplate;
	}

	const form = formAction(async () => {
		await saveSite(collection.id, { label, urlTemplate }, editId ?? undefined);
		reset();
	});

	async function run(action: () => Promise<void>) {
		error = '';
		try {
			await action();
		} catch (e) {
			error = errorMessage(e);
		}
	}
</script>

<div class="flex flex-col gap-3">
	<p class="text-base-content/60 flex items-center gap-1 text-xs" role="status">
		<Icon name="link" class="size-3" /> Sites ({activeCount} actif{activeCount > 1 ? 's' : ''} sur {sites.length})
	</p>
	<div class="flex flex-col gap-3">
		<ErrorAlert message={error} />
		{#each sites as site, i (site.id)}
			<div class="bg-base-200 rounded-box flex items-center gap-2 p-2">
				<div class="flex flex-col">
					<button
						class="btn btn-ghost btn-xs btn-square"
						disabled={i === 0}
						onclick={() => run(() => moveSite(collection.id, site.id, -1))}
						aria-label="Monter {site.label}"
						title="Monter"
					>
						<Icon name="chevronUp" class="size-4" />
					</button>
					<button
						class="btn btn-ghost btn-xs btn-square"
						disabled={i === sites.length - 1}
						onclick={() => run(() => moveSite(collection.id, site.id, 1))}
						aria-label="Descendre {site.label}"
						title="Descendre"
					>
						<Icon name="chevronDown" class="size-4" />
					</button>
				</div>
				<span class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="block truncate text-sm font-medium">{site.label}</span>
					<span class="text-base-content/50 block truncate text-xs">{site.urlTemplate}</span>
					<select
						class="select select-sm w-full max-w-52"
						value={siteMode(site)}
						onchange={(event) => run(() => setSiteMode(collection.id, site.id, event.currentTarget.value as SiteMode))}
						aria-label="Utilisation de {site.label}"
					>
						{#each MODES as mode (mode.value)}
							<option value={mode.value}>{mode.label}</option>
						{/each}
					</select>
				</span>
				{#if confirmId === site.id}
					<button class="btn btn-error btn-xs" onclick={() => run(() => deleteSite(collection.id, site.id))}>Supprimer</button>
					<button class="btn btn-ghost btn-xs" onclick={() => (confirmId = null)}>Annuler</button>
				{:else}
					<button class="btn btn-ghost btn-xs btn-square" onclick={() => edit(site)} aria-label="Modifier {site.label}" title="Modifier">
						<Icon name="edit" class="size-4" />
					</button>
					<button
						class="btn btn-ghost btn-xs btn-square text-error"
						onclick={() => (confirmId = site.id)}
						aria-label="Supprimer {site.label}"
						title="Supprimer"
					>
						<Icon name="trash" class="size-4" />
					</button>
				{/if}
			</div>
		{/each}

		<form class="flex flex-col gap-2" onsubmit={form.submit}>
			<input
				class="input input-sm w-full"
				placeholder="Libellé (anime)"
				aria-label="Libellé du site"
				maxlength={MAX_LABEL_LENGTH}
				bind:value={label}
				required
			/>
			<input
				class="input input-sm w-full"
				inputmode="url"
				autocapitalize="off"
				autocomplete="off"
				spellcheck="false"
				placeholder={`https://anime.fr/search?k=${NAME_PLACEHOLDER}`}
				aria-label="Modèle d'URL"
				bind:value={urlTemplate}
				required
			/>
			<p class="text-base-content/60 text-xs">
				{NAME_PLACEHOLDER} sera remplacé par le nom de la fiche, ou par le terme saisi sur la fiche ; {NOSPACE_PLACEHOLDER}
				par le nom sans espaces (« my name » → « myname »). Sans eux, le nom est ajouté à la fin de l'adresse. « Sur demande » : le lien n'apparaît que sur les fiches où vous l'activez, pour les sites où le
				nom ne suffit pas.
			</p>
			<ErrorAlert message={form.error} />
			<div class="flex gap-2">
				<button class="btn btn-outline btn-primary btn-sm" disabled={form.busy}>
					{#if editId}Enregistrer{:else}<Icon name="plus" class="size-4" /> Ajouter un site{/if}
				</button>
				{#if editId}<button type="button" class="btn btn-ghost btn-sm" onclick={reset}>Annuler</button>{/if}
			</div>
		</form>
	</div>
</div>
