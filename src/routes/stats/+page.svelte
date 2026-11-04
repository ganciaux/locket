<script lang="ts">
	// Statistiques de la collection active, en lecture seule : calculées en mémoire (stats.ts), rien de plus n'est lu.
	// Barres en <progress> : la CSP interdit les largeurs en style en ligne.
	import CollectionHeader from '$lib/components/CollectionHeader.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import PageSpinner from '$lib/components/PageSpinner.svelte';
	import { listView } from '$lib/entries/listView.svelte';
	import { countryFlag, countryName } from '$lib/entries/model';
	import { type Bucket, collectionStats } from '$lib/entries/stats';
	import { entries, loadEntries } from '$lib/entries/store.svelte';
	import { errorMessage } from '$lib/errors';

	const MAX_COUNTRIES = 12;

	let error = $state('');
	loadEntries().catch((e) => (error = errorMessage(e)));

	const stats = $derived(
		entries.active && entries.activeItems
			? collectionStats(entries.activeItems, entries.tags ?? [], entries.tagGroups, entries.ranking(entries.active.id))
			: null
	);
	const percent = (count: number, total: number) => (total ? `${Math.round((count / total) * 100)} %` : '0 %');
	const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

	const ratingLabel = (key: string) => (key === 'none' ? 'Sans note' : `${'★'.repeat(Number(key))}`);
	const countryLabel = (key: string) => (key === 'none' ? 'Sans pays' : `${countryFlag(key)} ${countryName(key)}`);
	const decadeLabel = (key: string) => (key === 'none' ? 'Sans naissance' : `Années ${key}`);
</script>

{#snippet bars(buckets: Bucket[], label: (key: string) => string, total: number)}
	<ul class="flex flex-col gap-1.5">
		{#each buckets as bucket (bucket.key)}
			<li class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm {bucket.key === 'none' ? 'text-base-content/60 italic' : ''}">
				<span class="truncate" title={label(bucket.key)}>{label(bucket.key)}</span>
				<progress class="progress progress-primary" value={bucket.count} max={total} aria-hidden="true"></progress>
				<span class="text-base-content/70 text-xs tabular-nums">{bucket.count}</span>
			</li>
		{/each}
	</ul>
{/snippet}

<CollectionHeader />
<h2 class="mb-4 text-xl font-bold">Statistiques</h2>

<ErrorAlert message={error} />

{#if !error && !entries.activeItems}
	<PageSpinner />
{:else if !entries.active}
	<p class="text-base-content/60 py-8 text-center">
		Les statistiques portent sur une collection. <a class="link link-primary" href="/collections">Créez d'abord une collection</a>.
	</p>
{:else if stats && stats.total === 0}
	<p class="text-base-content/60 py-8 text-center">Aucune fiche dans cette collection.</p>
{:else if stats}
	<div class="flex flex-col gap-4">
		<!-- Chiffres clés : deux colonnes sur téléphone, une ligne sur ordinateur. -->
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
			{#each [
				{ label: 'Fiches', value: stats.total, hint: stats.hidden ? `dont ${plural(stats.hidden, 'cachée')}` : '' },
				{ label: 'Avec image', value: stats.withImage, hint: percent(stats.withImage, stats.total) },
				{ label: 'Notées', value: stats.rated, hint: percent(stats.rated, stats.total) },
				{ label: 'Classées', value: stats.ranked, hint: percent(stats.ranked, stats.total) }
			] as item (item.label)}
				<div class="bg-base-100 rounded-box flex flex-col p-3 shadow-sm">
					<span class="text-base-content/60 text-xs">{item.label}</span>
					<span class="text-2xl font-bold tabular-nums">{item.value}</span>
					<span class="text-base-content/60 text-xs">{item.hint}</span>
				</div>
			{/each}
			<!-- Ouvre l'index filtré sur « Il manque : Une info ». -->
			<a
				class="bg-base-100 rounded-box hover:bg-base-200 col-span-2 flex flex-col p-3 shadow-sm sm:col-span-1"
				href="/list"
				onclick={() => (listView.indexMissing = 'any')}
			>
				<span class="text-base-content/60 text-xs">À compléter</span>
				<span class="text-2xl font-bold tabular-nums">{stats.incomplete}</span>
				<span class="link link-primary text-xs">Voir dans l'index</span>
			</a>
		</div>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h3 class="font-semibold">Notes</h3>
				{@render bars(stats.ratings, ratingLabel, stats.total)}
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h3 class="font-semibold">Pays</h3>
				{@render bars(stats.countries.filter((b) => b.key !== 'none').slice(0, MAX_COUNTRIES), countryLabel, stats.total)}
				{#if stats.countries.filter((b) => b.key !== 'none').length > MAX_COUNTRIES}
					{@const others = stats.countries.filter((b) => b.key !== 'none').slice(MAX_COUNTRIES)}
					<p class="text-base-content/60 text-xs">
						Et {plural(others.length, 'autre pays')} ({plural(others.reduce((sum, b) => sum + b.count, 0), 'fiche')}).
					</p>
				{/if}
				{@render bars(stats.countries.filter((b) => b.key === 'none'), countryLabel, stats.total)}
			</div>
		</section>

		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h3 class="font-semibold">Naissance</h3>
				{@render bars(stats.decades, decadeLabel, stats.total)}
			</div>
		</section>

		{#if stats.categories.length}
			<section class="card bg-base-100 shadow-sm">
				<div class="card-body gap-4">
					<h3 class="font-semibold">Tags</h3>
					{#each stats.categories as { group, covered, top } (group.id)}
						<div class="flex flex-col gap-1.5">
							<div class="flex items-baseline justify-between gap-2 text-sm">
								<span class="font-medium">{group.name}</span>
								<span class="text-base-content/60 text-xs">
									{covered} / {stats.total} fiches · {percent(covered, stats.total)}
								</span>
							</div>
							<progress class="progress progress-primary" value={covered} max={stats.total} aria-hidden="true"></progress>
							{#if top.length}
								<div class="flex flex-wrap gap-1">
									{#each top as { tag, count } (tag.id)}
										<span class="badge badge-soft badge-primary badge-sm">{tag.name} · {count}</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}
