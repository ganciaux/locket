<script lang="ts">
	import { MIN_PASSWORD_LENGTH, changePassword, checkNewPassword, rotateRecoveryKey, testRecoveryKey } from '$lib/auth/account';
	import { session, signOut } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { deleteAllData } from '$lib/entries/store.svelte';
	import { formAction } from '$lib/form.svelte';
	import { type AutoLock, prefs, type Theme } from '$lib/prefs.svelte';

	const THEMES: { value: Theme; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'light', label: 'Clair' },
		{ value: 'dark', label: 'Sombre' }
	];

	const AUTO_LOCKS: { value: AutoLock; label: string }[] = [
		{ value: 1, label: '1 min' },
		{ value: 5, label: '5 min' },
		{ value: 15, label: '15 min' },
		{ value: 30, label: '30 min' },
		{ value: 0, label: 'Jamais' }
	];

	let currentPassword = $state('');
	let password = $state('');
	let confirmation = $state('');
	let changed = $state(false);

	const form = formAction(async () => {
		changed = false;
		checkNewPassword(password, confirmation);
		await changePassword(currentPassword, password);
		currentPassword = password = confirmation = '';
		changed = true;
	});

	let rotateOpen = $state(false);
	let rotatePassword = $state('');
	let newRecoveryKey = $state('');
	let copied = $state(false);

	const rotate = formAction(async () => {
		newRecoveryKey = await rotateRecoveryKey(rotatePassword);
		rotatePassword = '';
		rotateOpen = false;
		copied = false;
	});

	let testOpen = $state(false);
	let testedKey = $state('');
	let keyValid = $state<boolean | null>(null);

	const keyTest = formAction(async () => {
		keyValid = null;
		keyValid = await testRecoveryKey(testedKey);
		testedKey = '';
	});

	async function copyRecoveryKey() {
		await navigator.clipboard.writeText(newRecoveryKey);
		copied = true;
	}

	// Suppression totale : le mot à taper évite qu'un mot de passe prérempli suffise.
	const WIPE_WORD = 'SUPPRIMER';
	let wipeOpen = $state(false);
	let wipePassword = $state('');
	let wipeWord = $state('');
	let wiped = $state<number | null>(null);

	function closeWipe() {
		wipeOpen = false;
		wipePassword = wipeWord = '';
	}

	const wipe = formAction(async () => {
		wiped = null;
		wiped = await deleteAllData(wipePassword);
		closeWipe();
	});
</script>

<a href="/" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Mes fiches</a>
<h1 class="mb-6 text-2xl font-bold">Paramètres</h1>

<div class="flex flex-col gap-6">
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Affichage</h2>
			<p class="text-base-content/60 -mt-2 text-sm">Réglages propres à cet appareil.</p>

			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium">Thème</span>
				<div class="join" role="radiogroup" aria-label="Thème">
					{#each THEMES as theme (theme.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="theme"
							value={theme.value}
							aria-label={theme.label}
							bind:group={prefs.theme}
						/>
					{/each}
				</div>
			</div>

			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Ouvrir les liens dans un nouvel onglet</span>
					<span class="text-base-content/60 text-xs">Recommandé sur iPhone : sinon, ouvrir un lien fait quitter l'app.</span>
				</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={prefs.linksInNewTab} />
			</label>

			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Afficher les liens sur les cartes</span>
					<span class="text-base-content/60 text-xs">Sinon, ils restent repliés sous « N liens ».</span>
				</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={prefs.cardLinksExpanded} />
			</label>

			<div class="flex flex-col gap-2">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Verrouillage automatique</span>
					<span class="text-base-content/60 text-xs">Après ce délai sans utilisation, le mot de passe est redemandé.</span>
				</span>
				<div class="join" role="radiogroup" aria-label="Verrouillage automatique">
					{#each AUTO_LOCKS as option (option.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="auto-lock"
							value={option.value}
							aria-label={option.label}
							bind:group={prefs.autoLockMinutes}
						/>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Collections</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Manga, Chanteurs, Sportifs… : chaque fiche appartient à une collection.</p>
			<a class="btn btn-outline btn-primary self-start" href="/collections"><Icon name="folder" class="size-4" /> Gérer les collections</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Tags</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Libellés libres propres à chaque collection, pour classer et filtrer vos fiches, chiffrés comme elles.</p>
			<a class="btn btn-outline btn-primary self-start" href="/tags"><Icon name="tag" class="size-4" /> Gérer les tags</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Sauvegarde</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Exporter vos fiches chiffrées dans un fichier, ou les restaurer.</p>
			<a class="btn btn-outline btn-primary self-start" href="/backup"><Icon name="import" class="size-4" /> Sauvegarder / restaurer</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Changer de mot de passe</h2>
			<p class="text-base-content/60 -mt-2 text-sm">Vos fiches ne sont pas rechiffrées : seule votre clé l'est.</p>
			<form class="flex flex-col gap-4" onsubmit={form.submit}>
				<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
				<Field label="Mot de passe actuel">
					<input class="input w-full" type="password" autocomplete="current-password" bind:value={currentPassword} required />
				</Field>
				<Field label="Nouveau mot de passe" hint="{MIN_PASSWORD_LENGTH} caractères minimum">
					<input
						class="input w-full"
						type="password"
						autocomplete="new-password"
						minlength={MIN_PASSWORD_LENGTH}
						bind:value={password}
						required
					/>
				</Field>
				<Field label="Confirmation">
					<input class="input w-full" type="password" autocomplete="new-password" bind:value={confirmation} required />
				</Field>
				<ErrorAlert message={form.error} />
				{#if changed}<p role="status" class="alert alert-success alert-soft text-sm">Mot de passe modifié.</p>{/if}
				<button class="btn btn-primary self-start" disabled={form.busy}>
					{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Modification…{:else}Changer le mot de passe{/if}
				</button>
			</form>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Clé de récupération</h2>
			<p class="text-base-content/60 -mt-1 text-sm">
				À remplacer si elle a pu être vue. L'ancienne n'ouvrira plus le compte, mais elle ouvre toujours les sauvegardes
				faites avant : refaites-en une et supprimez les anciennes.
			</p>
			{#if session.recoveryDamaged}
				<p role="alert" class="alert alert-warning alert-soft text-sm">
					Votre clé actuelle ne correspond plus à ce compte. Générez-en une nouvelle.
				</p>
			{/if}
			{#if newRecoveryKey}
				<p role="alert" class="alert alert-warning alert-soft text-sm">
					Elle ne sera plus jamais affichée. Notez-la sur papier ou dans un gestionnaire de mots de passe.
				</p>
				<p class="border-primary bg-base-200 rounded-box border-2 border-dashed p-4 text-center font-mono text-lg tracking-wide break-all">
					{newRecoveryKey}
				</p>
				<div class="flex gap-2">
					<button class="btn btn-outline btn-sm" onclick={copyRecoveryKey}>
						<Icon name={copied ? 'check' : 'copy'} class="size-4" />
						{copied ? 'Copiée' : 'Copier'}
					</button>
					<button class="btn btn-primary btn-sm" onclick={() => (newRecoveryKey = '')}>J'ai conservé ma clé</button>
				</div>
			{:else if rotateOpen}
				<form class="flex flex-col gap-3" onsubmit={rotate.submit}>
					<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
					<Field label="Mot de passe">
						<input class="input w-full" type="password" autocomplete="current-password" bind:value={rotatePassword} required />
					</Field>
					<ErrorAlert message={rotate.error} />
					<div class="flex gap-2">
						<button class="btn btn-primary" disabled={rotate.busy}>
							{#if rotate.busy}<span class="loading loading-spinner loading-sm"></span> Génération…{:else}Générer une nouvelle clé{/if}
						</button>
						<button type="button" class="btn btn-ghost" onclick={() => ((rotateOpen = false), (rotatePassword = ''))}>Annuler</button>
					</div>
				</form>
			{:else if testOpen}
				<form class="flex flex-col gap-3" onsubmit={keyTest.submit}>
					<Field label="Clé à tester">
						<input
							class="input w-full font-mono"
							autocomplete="off"
							autocapitalize="characters"
							spellcheck="false"
							placeholder="ABCD-EFGH-…"
							bind:value={testedKey}
							required
						/>
					</Field>
					{#if keyValid === true}
						<p role="status" class="alert alert-success alert-soft text-sm">Cette clé est la bonne.</p>
					{:else if keyValid === false}
						<p role="alert" class="alert alert-error alert-soft text-sm">
							Cette clé n'ouvre pas ce compte. Vérifiez votre saisie ; si elle est juste, remplacez-la.
						</p>
					{/if}
					<ErrorAlert message={keyTest.error} />
					<div class="flex gap-2">
						<button class="btn btn-primary" disabled={keyTest.busy}>Tester</button>
						<button type="button" class="btn btn-ghost" onclick={() => ((testOpen = false), (keyValid = null), (testedKey = ''))}>Fermer</button>
					</div>
				</form>
			{:else}
				<div class="flex flex-wrap gap-2">
					<button class="btn btn-outline btn-primary" onclick={() => (testOpen = true)}>Tester ma clé</button>
					<button class="btn btn-outline btn-primary" onclick={() => (rotateOpen = true)}>Remplacer la clé</button>
				</div>
			{/if}
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Supprimer toutes les données</h2>
			<p class="text-base-content/60 -mt-1 text-sm">
				Fiches, images, collections et tags. Votre compte, votre mot de passe et votre clé de récupération restent
				valables.
			</p>
			{#if wiped !== null}
				<p role="status" class="alert alert-success alert-soft text-sm">
					Toutes les données ont été supprimées ({wiped} fiche{wiped > 1 ? 's' : ''}).
				</p>
			{/if}
			{#if wipeOpen}
				<form class="alert alert-error alert-soft flex flex-col items-stretch gap-3" onsubmit={wipe.submit}>
					<p class="text-sm">
						<strong>Cette suppression est définitive</strong> : Firebase n'en garde aucune copie. Seule une sauvegarde
						permet de tout retrouver. <a class="link" href="/backup">Faire une sauvegarde d'abord</a>
					</p>
					<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
					<Field label="Mot de passe">
						<input class="input w-full" type="password" autocomplete="current-password" bind:value={wipePassword} required />
					</Field>
					<Field label="Écrivez {WIPE_WORD} pour confirmer">
						<input class="input w-full" autocomplete="off" autocapitalize="characters" spellcheck="false" bind:value={wipeWord} required />
					</Field>
					<ErrorAlert message={wipe.error} />
					<div class="flex gap-2">
						<button class="btn btn-error" disabled={wipe.busy || wipeWord !== WIPE_WORD}>
							{#if wipe.busy}<span class="loading loading-spinner loading-sm"></span> Suppression…{:else}Tout supprimer{/if}
						</button>
						<button type="button" class="btn btn-ghost" disabled={wipe.busy} onclick={closeWipe}>Annuler</button>
					</div>
				</form>
			{:else}
				<button class="btn btn-outline btn-error self-start" onclick={() => ((wipeOpen = true), (wiped = null))}>
					<Icon name="trash" class="size-4" /> Supprimer toutes les données
				</button>
			{/if}
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Compte</h2>
			<p class="text-sm break-all">{session.user?.email}</p>
			<button class="btn btn-outline btn-error self-start" onclick={signOut}>Se déconnecter</button>
		</div>
	</section>
</div>
