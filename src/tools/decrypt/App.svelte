<script lang="ts">
	// Lecture d'une sauvegarde Stash hors ligne : fichier, secret de l'époque, puis vue par collection.
	// La page n'a aucun accès au réseau (CSP) : rien ne sort de l'ordinateur, sauf la page en clair si on l'enregistre.
	import { type Backup, parseBackup } from '$lib/backup/format';
	import { unwrapBackupDek } from '$lib/backup/keyring';
	import { readBackup } from '$lib/backup/reader';
	import { type ViewCollection, type ViewEntry, backupView } from '$lib/backup/readerView';
	import { type Bytes, toBase64 } from '$lib/crypto/encoding';
	import { countryFlag, countryName, formatAge, formatRating, linkTitle } from '$lib/entries/model';
	import { plainFileName, plainPage } from './plainPage';

	let backup = $state.raw<Backup | null>(null);
	let fileName = $state('');
	let mode = $state<'key' | 'password'>('key');
	let secret = $state('');
	let email = $state('');
	let busy = $state(false);
	let error = $state('');
	let collections = $state.raw<ViewCollection[] | null>(null);
	let problems = $state.raw<string[]>([]);
	/** Date scellée dans le manifeste ; null : illisible, seule celle du fichier (non vérifiée) est connue. */
	let sealedAt = $state<string | null>(null);
	let confirmPlain = $state(false);
	let fullImages = $state(false);
	let zoom = $state<{ url: string; name: string } | null>(null);
	let zoomDialog = $state<HTMLDialogElement>();
	// Images qui ne se décodent pas (fichier abîmé, type erroné) : masquées plutôt qu'affichées cassées.
	let broken = $state.raw<string[]>([]);

	// Une URL par image affichée, libérées quand on ferme la sauvegarde.
	let urls: string[] = [];
	const urlCache = new Map<Bytes, string>();
	function urlOf(bytes: Bytes, type: string): string {
		let url = urlCache.get(bytes);
		if (!url) {
			url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
			urlCache.set(bytes, url);
			urls.push(url);
		}
		return url;
	}

	function close() {
		urls.forEach((url) => URL.revokeObjectURL(url));
		urls = [];
		urlCache.clear();
		backup = collections = sealedAt = null;
		problems = broken = [];
		secret = email = error = fileName = '';
		confirmPlain = false;
	}

	async function pickFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		close();
		try {
			backup = parseBackup(await file.text());
			fileName = file.name;
		} catch (e) {
			error = (e as Error).message;
		}
	}

	async function open(event: SubmitEvent) {
		event.preventDefault();
		if (!backup || busy) return;
		busy = true;
		error = '';
		try {
			// Le mot de passe est pris tel quel, comme dans l'app : un espace au bord fait partie du secret.
			const dek =
				mode === 'password'
					? await unwrapBackupDek(backup.keyring, email.trim(), secret)
					: await unwrapBackupDek(backup.keyring, undefined, secret.trim());
			const reading = await readBackup(backup, dek);
			collections = backupView(reading);
			problems = reading.problems;
			sealedAt = reading.createdAt;
			secret = '';
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	const count = (list: ViewCollection[]) => list.reduce((total, c) => total + c.entries.length + c.trash.length, 0);
	const formatDate = (iso: string | number) =>
		new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
	const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

	/** Copie de la vue affichée, sans boutons ni script, images intégrées en data:. */
	async function savePlain() {
		const view = document.getElementById('reading');
		if (!view || !backup || !collections) return;
		const clone = view.cloneNode(true) as HTMLElement;
		clone.querySelectorAll('[data-noexport]').forEach((element) => element.remove());
		const byId = new Map(collections.flatMap((c) => [...c.entries, ...c.trash]).map((entry) => [entry.id, entry]));
		for (const img of clone.querySelectorAll<HTMLImageElement>('img[data-entry]')) {
			const entry = byId.get(img.dataset.entry ?? '');
			const bytes = entry && (fullImages ? (entry.image ?? entry.thumb) : (entry.thumb ?? entry.image));
			if (entry?.imageType && bytes) img.src = `data:${entry.imageType};base64,${toBase64(bytes)}`;
			else img.remove();
			img.removeAttribute('data-entry');
		}
		// Autres images : sans miniature, elles ne sont gardées qu'avec les images complètes.
		for (const img of clone.querySelectorAll<HTMLImageElement>('img[data-extra]')) {
			const [id, index] = (img.dataset.extra ?? '').split(':');
			const extra = byId.get(id)?.extras[Number(index)];
			if (fullImages && extra) img.src = `data:${extra.type};base64,${toBase64(extra.bytes)}`;
			else (img.closest('button') ?? img).remove();
			img.removeAttribute('data-extra');
		}
		clone.querySelectorAll('[data-extras]').forEach((element) => {
			if (!element.querySelector('img')) element.remove();
			element.removeAttribute('data-extras');
		});
		const css = [...document.querySelectorAll('style')].map((style) => style.textContent).join('\n');
		const date = sealedAt ? formatDate(sealedAt) : `${formatDate(backup.createdAt)} (date non vérifiée)`;
		const page = await plainPage({ title: `Stash — sauvegarde du ${date}`, body: clone.outerHTML, css });
		const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
		const link = Object.assign(document.createElement('a'), { href: url, download: plainFileName(new Date()) });
		link.click();
		// Assez longtemps pour une page lourde (images complètes), comme pour la sauvegarde.
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
		confirmPlain = false;
	}

	function showImage(entry: ViewEntry) {
		const bytes = entry.image ?? entry.thumb;
		if (!bytes || !entry.imageType) return;
		zoom = { url: urlOf(bytes, entry.imageType), name: entry.name };
		zoomDialog?.showModal();
	}

	function showExtra(entry: ViewEntry, extra: ViewEntry['extras'][number]) {
		zoom = { url: urlOf(extra.bytes, extra.type), name: entry.name };
		zoomDialog?.showModal();
	}
</script>

{#snippet card(entry: ViewEntry)}
	{@const preview = entry.thumb ?? entry.image}
	<li class="card card-side bg-base-100 shadow-sm {entry.hidden || entry.deletedAt ? 'opacity-70' : ''}">
		{#if preview && entry.imageType && !broken.includes(entry.id)}
			<figure class="bg-base-200 w-24 shrink-0 self-stretch">
				<img
					src={urlOf(preview, entry.imageType)}
					alt=""
					loading="lazy"
					data-entry={entry.id}
					class="size-full object-cover {entry.framing}"
					onerror={() => (broken = [...broken, entry.id])}
				/>
			</figure>
		{/if}
		<div class="card-body min-w-0 gap-1 p-3">
			<h3 class="flex flex-wrap items-center gap-1 font-semibold break-words">
				{#if entry.rank}<span class="badge badge-neutral badge-sm">#{entry.rank}</span>{/if}
				{entry.name}
				{#if entry.hidden}<span class="badge badge-ghost badge-sm">cachée</span>{/if}
				{#if entry.validated}<span class="badge badge-primary badge-soft badge-sm">validée</span>{/if}
			</h3>
			<p class="text-base-content/70 flex flex-wrap gap-x-3 text-sm">
				{#if entry.rating}<span>★ {formatRating(entry.rating)} / 5</span>{/if}
				{#if entry.country}<span>{countryFlag(entry.country)} {countryName(entry.country)}</span>{/if}
				{#if entry.birthYear}<span>{entry.birthYear} ({formatAge(entry.birthYear)})</span>{/if}
				{#if entry.deletedAt}<span>À la corbeille depuis le {formatDate(entry.deletedAt)}</span>{/if}
			</p>
			{#if entry.remarks}<p class="text-sm break-words whitespace-pre-line">{entry.remarks}</p>{/if}
			{#each entry.tags as section, i (i)}
				<p class="text-sm">
					{#if section.group}<span class="text-base-content/60">{section.group} :</span>{/if}
					{section.names.join(', ')}
				</p>
			{/each}
			{#if entry.links.length}
				<ul class="flex flex-wrap gap-x-3 text-sm">
					{#each entry.links as link, i (i)}
						<li><a class="link link-primary" href={link.url} target="_blank" rel="noopener noreferrer">{linkTitle(link)}</a></li>
					{/each}
				</ul>
			{/if}
			{#if entry.image && entry.imageType}
				<button type="button" class="btn btn-ghost btn-xs self-start" data-noexport onclick={() => showImage(entry)}>
					Image complète
				</button>
			{/if}
			{#if entry.extras.length}
				<div class="flex flex-wrap gap-1" aria-label="Autres images" data-extras>
					{#each entry.extras as extra, i (i)}
						<button type="button" class="cursor-zoom-in" onclick={() => showExtra(entry, extra)} aria-label="Image {i + 2} de {entry.name}">
							<img src={urlOf(extra.bytes, extra.type)} alt="" loading="lazy" data-extra="{entry.id}:{i}" class="rounded-box size-14 object-cover" />
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</li>
{/snippet}

<main class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
	<header>
		<h1 class="text-2xl font-bold">Lire une sauvegarde Stash</h1>
		<p class="text-base-content/70 text-sm">
			Hors ligne et sans Stash : cette page n'a aucun accès au réseau, rien ne quitte cet ordinateur (sauf si vous
			cliquez un lien de fiche, qui ouvre son site comme dans l'app). Il faut le fichier de sauvegarde et la clé de
			récupération, ou le mot de passe, de l'époque de la sauvegarde.
		</p>
	</header>

	{#if !collections}
		<section class="card bg-base-100 shadow-sm">
			<form class="card-body gap-4" onsubmit={open}>
				<label class="flex flex-col gap-1">
					<span class="text-sm font-medium">Fichier de sauvegarde (.json)</span>
					<input type="file" accept=".json,application/json" class="file-input w-full" aria-label="Fichier de sauvegarde" onchange={pickFile} />
				</label>
				{#if backup}
					<p class="text-sm" role="status">
						{fileName} : sauvegarde du {formatDate(backup.createdAt)}, {plural(backup.entries.length, 'fiche')}{backup.includesImages
							? ''
							: ', sans images complètes (sauvegarde légère)'}.
					</p>
					<div class="join" role="radiogroup" aria-label="Secret">
						<input class="join-item btn btn-sm" type="radio" name="mode" value="key" aria-label="Clé de récupération" bind:group={mode} />
						<input class="join-item btn btn-sm" type="radio" name="mode" value="password" aria-label="Mot de passe" bind:group={mode} />
					</div>
					{#if mode === 'password'}
						<label class="flex flex-col gap-1">
							<span class="text-sm font-medium">Email du compte</span>
							<input class="input w-full" type="email" autocomplete="username" bind:value={email} required />
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-sm font-medium">Mot de passe de l'époque</span>
							<input class="input w-full" type="password" autocomplete="current-password" bind:value={secret} required />
						</label>
					{:else}
						<label class="flex flex-col gap-1">
							<span class="text-sm font-medium">Clé de récupération</span>
							<input class="input w-full font-mono" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-…" bind:value={secret} required />
						</label>
					{/if}
					<button class="btn btn-primary self-start" disabled={busy}>
						{#if busy}<span class="loading loading-spinner loading-sm"></span>{/if} Ouvrir
					</button>
				{/if}
				{#if error}<p class="alert alert-error alert-soft text-sm" role="alert">{error}</p>{/if}
			</form>
		</section>
	{:else if backup}
		<div id="reading" class="flex flex-col gap-4">
			<p class="text-sm" role="status">
				Sauvegarde du {sealedAt ? formatDate(sealedAt) : `${formatDate(backup.createdAt)} (date non vérifiée)`} :
				{plural(count(collections), 'fiche')} dans
				{plural(collections.length, 'collection')}{backup.includesImages ? '' : ', sans images complètes'}.
			</p>
			{#if problems.length}
				<div class="alert alert-warning alert-soft flex flex-col items-start gap-1 text-sm" role="alert">
					<p class="font-medium">Fichier incomplet ou modifié : seul ce qui est lisible est affiché.</p>
					<ul class="list-disc pl-5">
						{#each problems as problem, i (i)}<li>{problem}</li>{/each}
					</ul>
				</div>
			{/if}

			<div class="card bg-base-100 shadow-sm" data-noexport>
				<div class="card-body gap-3">
					<div class="flex flex-wrap gap-2">
						<button type="button" class="btn btn-sm" onclick={() => (confirmPlain = true)} disabled={confirmPlain}>
							Enregistrer la page en clair
						</button>
						<button type="button" class="btn btn-ghost btn-sm" onclick={close}>Fermer la sauvegarde</button>
					</div>
					{#if confirmPlain}
						<div class="alert alert-warning flex flex-col items-start gap-2 text-sm">
							<p>
								Le fichier enregistré contiendra vos fiches <strong>en clair</strong>, fiches et collections cachées et
								corbeille comprises : quiconque l'ouvre peut les lire, sans mot de passe. Gardez-le en lieu sûr et
								supprimez-le quand il ne sert plus.
							</p>
							<label class="flex items-center gap-2">
								<input type="checkbox" class="checkbox checkbox-sm checkbox-primary" bind:checked={fullImages} />
								Images complètes (fichier plus lourd) ; sinon les miniatures
							</label>
							<div class="flex gap-2">
								<button type="button" class="btn btn-warning btn-sm" onclick={savePlain}>Enregistrer en clair</button>
								<button type="button" class="btn btn-ghost btn-sm" onclick={() => (confirmPlain = false)}>Annuler</button>
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if collections.length > 1}
				<nav class="flex flex-wrap gap-2" aria-label="Collections">
					{#each collections as collection (collection.id)}
						<a class="badge badge-outline badge-primary" href="#col-{collection.id}">{collection.name}</a>
					{/each}
				</nav>
			{/if}

			{#each collections as collection (collection.id)}
				<section id="col-{collection.id}" class="flex flex-col gap-2" aria-labelledby="title-{collection.id}">
					<h2 id="title-{collection.id}" class="flex flex-wrap items-center gap-2 text-xl font-bold">
						{collection.name}
						<span class="badge badge-primary badge-sm">{collection.entries.length}</span>
						{#if collection.hidden}<span class="badge badge-ghost badge-sm">collection cachée</span>{/if}
					</h2>
					{#if collection.ranked}
						<p class="text-base-content/60 text-xs">{plural(collection.ranked, 'fiche')} au classement (#1 = la meilleure).</p>
					{/if}
					{#if collection.entries.length}
						<ul class="flex flex-col gap-2">
							{#each collection.entries as entry (entry.id)}{@render card(entry)}{/each}
						</ul>
					{:else}
						<p class="text-base-content/60 text-sm">Aucune fiche.</p>
					{/if}
					{#if collection.trash.length}
						<h3 class="text-base-content/70 mt-2 font-semibold">Corbeille ({collection.trash.length})</h3>
						<ul class="flex flex-col gap-2">
							{#each collection.trash as entry (entry.id)}{@render card(entry)}{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<dialog class="modal" bind:this={zoomDialog} onclose={() => (zoom = null)}>
	<div class="modal-box max-w-3xl p-2">
		{#if zoom}<img src={zoom.url} alt={zoom.name} class="w-full object-contain" />{/if}
		<div class="mt-2 flex justify-end"><button type="button" class="btn btn-sm" onclick={() => zoomDialog?.close()}>Fermer</button></div>
	</div>
	<button type="button" class="modal-backdrop" aria-label="Fermer" onclick={() => zoomDialog?.close()}></button>
</dialog>
