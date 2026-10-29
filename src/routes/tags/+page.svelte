<script lang="ts">
	// Administration des tags : ajout et suppression. Le catalogue est chiffré comme les fiches.
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { MAX_TAG_LENGTH } from '$lib/entries/model';
	import { addTag, deleteTag, entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	let name = $state('');
	let error = $state('');
	let confirmId = $state<string | null>(null);

	loadEntries().catch((e) => (error = errorMessage(e)));

	const addForm = formAction(async () => {
		await addTag(name);
		name = '';
	});

	const removal = formAction(async () => {
		if (confirmId) await deleteTag(confirmId);
		confirmId = null;
	});
</script>

<a href="/parametres" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-4 text-2xl font-bold">Tags</h1>

<ErrorAlert message={error} />

{#if !error && !entries.tags}
	<div class="flex justify-center py-12"><span class="loading loading-spinner loading-lg text-primary"></span></div>
{:else if entries.tags}
	<div class="flex flex-col gap-4">
		<form class="card bg-base-100 shadow-sm" onsubmit={addForm.submit}>
			<div class="card-body gap-3">
				<div class="join w-full">
					<input
						class="input join-item w-full"
						placeholder="Nouveau tag"
						aria-label="Nouveau tag"
						maxlength={MAX_TAG_LENGTH}
						bind:value={name}
						required
					/>
					<button class="btn btn-primary join-item" disabled={addForm.busy}>
						{#if addForm.busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="plus" class="size-4" />{/if}
						Ajouter
					</button>
				</div>
				<ErrorAlert message={addForm.error} />
			</div>
		</form>

		{#if entries.tags.length === 0}
			<p class="text-base-content/60 py-8 text-center">Aucun tag pour l'instant.</p>
		{:else}
			<ul class="card bg-base-100 divide-base-200 divide-y shadow-sm">
				{#each entries.tags as tag (tag.id)}
					{@const count = entries.countWithTag(tag.id)}
					<li class="flex flex-col gap-2 p-4">
						<div class="flex items-center gap-3">
							<Icon name="tag" class="text-primary size-4" />
							<span class="flex-1 font-medium break-all">{tag.name}</span>
							<span class="text-base-content/60 text-xs">{count} fiche{count > 1 ? 's' : ''}</span>
							{#if confirmId !== tag.id}
								<button
									class="btn btn-ghost btn-sm btn-square text-error"
									onclick={() => (confirmId = tag.id)}
									aria-label="Supprimer le tag {tag.name}"
									title="Supprimer"
								>
									<Icon name="trash" class="size-4" />
								</button>
							{/if}
						</div>
						{#if confirmId === tag.id}
							<form class="alert alert-error alert-soft flex flex-wrap items-center gap-2" onsubmit={removal.submit}>
								<span class="flex-1 text-sm">
									Supprimer « {tag.name} »{count ? ` et le retirer de ${count} fiche${count > 1 ? 's' : ''}` : ''} ?
								</span>
								<button class="btn btn-error btn-sm" disabled={removal.busy}>Supprimer</button>
								<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmId = null)}>Annuler</button>
								<ErrorAlert message={removal.error} />
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
