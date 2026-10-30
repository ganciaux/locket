<script lang="ts">
	// Sauvegarde chiffrée (export) et restauration (import). Le fichier reste illisible sans mot de passe.
	import {
		type RestoreResult,
		OldKeyRequired,
		checkBackup,
		createBackup,
		plural,
		restoreBackup
	} from '$lib/backup/backup';
	import { type Backup, type BackupCounts, backupFileName, parseBackup } from '$lib/backup/format';
	import { readBackupInfo, recordBackup } from '$lib/backup/reminder';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { session } from '$lib/auth/session.svelte';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	// --- Export
	let includeImages = $state(true);
	let lastBackupAt = $state(readBackupInfo().lastAt);

	let skipped = $state(0);

	const exportForm = formAction(async () => {
		const backup = await createBackup(includeImages);
		skipped = backup.skipped;
		const blob = new Blob([backup.text], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = Object.assign(document.createElement('a'), { href: url, download: backupFileName(new Date()) });
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
		recordBackup();
		lastBackupAt = readBackupInfo().lastAt;
	});

	// --- Restauration
	let backup = $state.raw<Backup | null>(null);
	let counts = $state.raw<BackupCounts | null>(null);
	let checking = $state(false);
	let fileError = $state('');
	let needsOldKey = $state(false);
	let currentPassword = $state('');
	let oldSecret = $state('');
	let replaceConfirmed = $state(false);
	let result = $state<RestoreResult | null>(null);

	async function readFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		backup = counts = null;
		fileError = '';
		needsOldKey = false;
		replaceConfirmed = false;
		result = null;
		const file = input.files?.[0];
		if (!file) return;
		checking = true;
		try {
			const parsed = parseBackup(await file.text());
			counts = await checkBackup(parsed);
			backup = parsed;
		} catch (e) {
			fileError = errorMessage(e);
		} finally {
			checking = false;
		}
	}

	const restoreForm = formAction(async () => {
		if (!backup) return;
		try {
			result = await restoreBackup(backup, needsOldKey ? { currentPassword, oldSecret } : undefined);
			currentPassword = oldSecret = '';
			needsOldKey = false;
			replaceConfirmed = false;
			backup = null;
		} catch (e) {
			if (e instanceof OldKeyRequired) {
				needsOldKey = true;
				return;
			}
			throw e;
		}
	});

	const formatDate = (iso: string) =>
		new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
</script>

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-4 text-2xl font-bold">Sauvegarde</h1>

<div class="flex flex-col gap-6">
	<section class="card bg-base-100 shadow-sm">
		<form class="card-body gap-4" onsubmit={exportForm.submit}>
			<h2 class="card-title text-lg">Exporter</h2>
			<p class="text-base-content/70 text-sm">
				Un fichier contenant vos fiches <strong>chiffrées</strong> : illisible sans votre mot de passe ou votre clé
				de récupération. Conservez-le avec votre clé de récupération : ensemble, ils permettent de tout retrouver,
				même si le compte disparaît.
			</p>
			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Inclure les images</span>
					<span class="text-base-content/60 text-xs">Fichier plus lourd ; sans elles, seules les miniatures sont gardées.</span>
				</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={includeImages} />
			</label>
			<p class="text-base-content/60 text-xs">
				{lastBackupAt
					? `Dernière sauvegarde depuis cet appareil : ${formatDate(new Date(lastBackupAt).toISOString())}.`
					: 'Aucune sauvegarde depuis cet appareil.'}
			</p>
			<ErrorAlert message={exportForm.error} />
			{#if skipped}
				<p role="alert" class="alert alert-warning alert-soft text-sm">
					{skipped} élément{skipped > 1 ? 's' : ''} illisible{skipped > 1 ? 's' : ''} (fiche, miniature ou image endommagée)
					n'{skipped > 1 ? 'ont' : 'a'} pas été sauvegardé{skipped > 1 ? 's' : ''}.
				</p>
			{/if}
			<button class="btn btn-primary self-start" disabled={exportForm.busy}>
				{#if exportForm.busy}<span class="loading loading-spinner loading-sm"></span> Préparation…{:else}<Icon
						name="import"
						class="size-4 rotate-180"
					/> Télécharger la sauvegarde{/if}
			</button>
		</form>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<form class="card-body gap-4" onsubmit={restoreForm.submit}>
			<h2 class="card-title text-lg">Restaurer</h2>
			<p class="text-base-content/70 text-sm">
				La sauvegarde <strong>remplace tout le compte</strong> : fiches, collections et tags. Ce qui a été ajouté ou
				modifié depuis cette sauvegarde est perdu.
			</p>
			<input type="file" accept=".json,application/json" class="file-input w-full" disabled={checking} onchange={readFile} />
			<ErrorAlert message={fileError} />
			{#if checking}
				<p class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-sm"></span> Vérification du fichier…</p>
			{/if}

			{#if backup}
				<p class="bg-base-200 rounded-box p-3 text-sm">
					Sauvegarde du {formatDate(backup.createdAt)} :
					{#if counts}
						<strong>{plural(counts.entries, 'fiche')}</strong>, {plural(counts.collections, 'collection')},
						{plural(counts.tags, 'tag')}, {backup.includesImages ? 'avec' : 'sans'} les images.
					{:else}
						<strong>{plural(backup.entries.length, 'fiche')}</strong>, {backup.includesImages ? 'avec' : 'sans'} les images.
					{/if}
				</p>
				{#if counts}
					<p role="status" class="alert alert-success alert-soft text-sm">Fichier vérifié : complet et non modifié depuis son export.</p>
				{:else}
					<p class="text-base-content/70 text-sm">Fichier chiffré avec une autre clé : il sera vérifié à la restauration.</p>
				{/if}
				<label class="flex cursor-pointer items-start gap-3 text-sm">
					<input type="checkbox" class="checkbox checkbox-error checkbox-sm" bind:checked={replaceConfirmed} />
					<span>Je comprends que le contenu actuel du compte sera remplacé par cette sauvegarde.</span>
				</label>
			{/if}

			{#if needsOldKey}
				<div role="alert" class="alert alert-warning alert-soft flex-col items-start text-sm">
					<p>
						Cette sauvegarde a été chiffrée avec une autre clé (compte supprimé puis recréé, par exemple). Elle ne
						peut être restaurée que dans un compte <strong>sans fiche</strong>, qui adoptera sa clé.
					</p>
					<p>
						Après la restauration, la clé de récupération valable sera <strong>celle de l'ancien compte</strong>, et
						non plus celle affichée à la création de ce compte.
					</p>
				</div>
				<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
				<Field label="Mot de passe actuel">
					<input class="input w-full" type="password" autocomplete="current-password" bind:value={currentPassword} required />
				</Field>
				<Field
					label="Ancien mot de passe ou clé de récupération de l'ancien compte"
					hint="Le mot de passe ne fonctionne que si l'email n'a pas changé."
				>
					<input class="input w-full" type="password" autocomplete="off" bind:value={oldSecret} required />
				</Field>
			{/if}

			<ErrorAlert message={restoreForm.error} />
			{#if result}
				<p role="status" class="alert alert-success alert-soft text-sm">
					{result.restored} fiche{result.restored > 1 ? 's' : ''} restaurée{result.restored > 1 ? 's' : ''}.
					{#if result.removed}
						{result.removed} fiche{result.removed > 1 ? 's' : ''} absente{result.removed > 1 ? 's' : ''} de la sauvegarde
						supprimée{result.removed > 1 ? 's' : ''}.
					{/if}
					{#if result.adopted}
						Votre clé de récupération valable est désormais celle de l'ancien compte.
					{/if}
					<a class="link" href="/">Voir mes fiches</a>
				</p>
			{/if}
			<button class="btn btn-primary self-start" disabled={!backup || !replaceConfirmed || checking || restoreForm.busy}>
				{#if restoreForm.busy}<span class="loading loading-spinner loading-sm"></span> Restauration…{:else}Restaurer{/if}
			</button>
		</form>
	</section>
</div>
