<script lang="ts">
	// Corbeille : les fiches supprimées restent TRASH_DAYS jours, images comprises, puis disparaissent à l'ouverture.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { TRASH_DAYS, trashDaysLeft } from '$lib/entries/model';
	import { type ListItem, deleteForever, entries, loadEntries, restoreFromTrash } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let error = $state('');
	let busy = $state(false);
	let confirmId = $state<string | null>(null);
	let confirmEmpty = $state(false);
	const now = Date.now();

	loadEntries().catch((e) => (error = errorMessage(e)));

	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			await action();
			confirmId = null;
			confirmEmpty = false;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}

	const remaining = (entry: ListItem) => {
		const days = trashDaysLeft(entry.deletedAt!, now);
		return days > 1 ? `Encore ${days} jours` : 'Dernier jour';
	};
</script>

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-1 text-2xl font-bold">Corbeille</h1>
<p class="text-base-content/60 mb-4 text-sm">Les fiches supprimées y restent {TRASH_DAYS} jours, puis disparaissent définitivement.</p>

<ErrorAlert message={error} />

{#if !error && !entries.items}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.trash.length === 0}
	<p class="text-base-content/60 py-8 text-center">La corbeille est vide.</p>
{:else}
	<ul class="card bg-base-100 divide-base-200 divide-y shadow-sm">
		{#each entries.trash as entry (entry.id)}
			<li class="flex flex-wrap items-center gap-2 p-3">
				<span class="min-w-0 flex-1">
					<span class="block truncate font-medium">{entry.name}</span>
					<span class="text-base-content/60 text-xs">{remaining(entry)}</span>
				</span>
				{#if confirmId === entry.id}
					<button class="btn btn-error btn-sm" disabled={busy} onclick={() => run(() => deleteForever([entry]))}>
						Supprimer définitivement
					</button>
					<button class="btn btn-ghost btn-sm" onclick={() => (confirmId = null)}>Annuler</button>
				{:else}
					<button class="btn btn-primary btn-sm" disabled={busy} onclick={() => run(() => restoreFromTrash([entry]))}>Restaurer</button>
					<button
						class="btn btn-ghost btn-sm btn-square text-error"
						onclick={() => (confirmId = entry.id)}
						aria-label="Supprimer définitivement {entry.name}"
						title="Supprimer définitivement"
					>
						<Icon name="trash" class="size-4" />
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="mt-4 flex flex-wrap items-center gap-2">
		{#if confirmEmpty}
			<span class="text-sm">Supprimer définitivement {entries.trash.length} fiche{entries.trash.length > 1 ? 's' : ''} ?</span>
			<button class="btn btn-error btn-sm" disabled={busy} onclick={() => run(() => deleteForever(entries.trash))}>Vider</button>
			<button class="btn btn-ghost btn-sm" onclick={() => (confirmEmpty = false)}>Annuler</button>
		{:else}
			<button class="btn btn-outline btn-error btn-sm" onclick={() => (confirmEmpty = true)}>Vider la corbeille</button>
		{/if}
	</div>
{/if}
