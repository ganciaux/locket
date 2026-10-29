<script lang="ts">
	import { lock } from '$lib/auth/session.svelte';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	let query = $state('');
	let error = $state('');

	loadEntries().catch((e) => (error = errorMessage(e)));

	const results = $derived(entries.search(query));
</script>

<header class="bar">
	<h1>Mes fiches</h1>
	<a class="button" href="/fiche/nouvelle">Nouvelle</a>
</header>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if !entries.items}
	<p>Déchiffrement…</p>
{:else if entries.items.length === 0}
	<p>Aucune fiche pour l'instant.</p>
{:else}
	<input type="search" placeholder="Rechercher par nom" aria-label="Rechercher" bind:value={query} />
	{#if results.length === 0}
		<p class="hint">Aucune fiche ne correspond.</p>
	{/if}
	<ul class="entries">
		{#each results as entry (entry.id)}
			<li>
				<a href="/fiche/{entry.id}">
					{#if entry.thumbUrl}
						<img src={entry.thumbUrl} alt="" />
					{:else}
						<span class="no-thumb" aria-hidden="true">{entry.name.charAt(0).toUpperCase()}</span>
					{/if}
					<span>{entry.name}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<footer class="bar">
	<a href="/parametres">Paramètres</a>
	<button class="link" onclick={lock}>Verrouiller</button>
</footer>
