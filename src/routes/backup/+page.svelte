<script lang="ts">
	// Sauvegarde chiffrée (export) et restauration (import). Le fichier reste illisible sans mot de passe.
	import { type RestoreResult, OldKeyRequired, createBackup, restoreBackup } from '$lib/backup/backup';
	import { type Backup, backupFileName, parseBackup } from '$lib/backup/format';
	import { readBackupInfo, recordBackup } from '$lib/backup/reminder';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { session } from '$lib/auth/session.svelte';
	import { formAction } from '$lib/form.svelte';

	// --- Export
	let includeImages = $state(true);
	let lastBackupAt = $state(readBackupInfo().lastAt);

	const exportForm = formAction(async () => {
		const blob = new Blob([await createBackup(includeImages)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = Object.assign(document.createElement('a'), { href: url, download: backupFileName(new Date()) });
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
		recordBackup();
		lastBackupAt = readBackupInfo().lastAt;
	});

	// --- Restauration
	let backup = $state.raw<Backup | null>(null);
	let fileError = $state('');
	let needsOldKey = $state(false);
	let currentPassword = $state('');
	let oldSecret = $state('');
	let result = $state<RestoreResult | null>(null);

	async function readFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		backup = null;
		fileError = '';
		needsOldKey = false;
		result = null;
		const file = input.files?.[0];
		if (!file) return;
		try {
			backup = parseBackup(await file.text());
		} catch (e) {
			fileError = e instanceof Error ? e.message : 'Fichier illisible.';
		}
	}

	const restoreForm = formAction(async () => {
		if (!backup) return;
		try {
			result = await restoreBackup(backup, needsOldKey ? { currentPassword, oldSecret } : undefined);
			currentPassword = oldSecret = '';
			needsOldKey = false;
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
				Les fiches du fichier remplacent celles qui ont le même identifiant et les fiches manquantes sont recréées.
				Rien n'est supprimé.
			</p>
			<input type="file" accept=".json,application/json" class="file-input w-full" onchange={readFile} />
			<ErrorAlert message={fileError} />

			{#if backup}
				<p class="bg-base-200 rounded-box p-3 text-sm">
					Sauvegarde du {formatDate(backup.createdAt)} : <strong>{backup.entries.length}</strong>
					fiche{backup.entries.length > 1 ? 's' : ''}, {backup.includesImages ? 'avec' : 'sans'} les images.
				</p>
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
					{#if result.adopted}
						Votre clé de récupération valable est désormais celle de l'ancien compte.
					{/if}
					<a class="link" href="/">Voir mes fiches</a>
				</p>
			{/if}
			<button class="btn btn-primary self-start" disabled={!backup || restoreForm.busy}>
				{#if restoreForm.busy}<span class="loading loading-spinner loading-sm"></span> Restauration…{:else}Restaurer{/if}
			</button>
		</form>
	</section>
</div>
