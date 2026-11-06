<script lang="ts">
	import {
		MIN_PASSWORD_LENGTH,
		changePassword,
		checkNewPassword,
		enableFaceId,
		rotateRecoveryKey,
		testRecoveryKey
	} from '$lib/auth/account';
	import { faceIdSupported, forgetFaceId, readFaceId } from '$lib/auth/faceId';
	import { session, signOut } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { TRASH_DAYS } from '$lib/entries/model';
	import { deleteAllData, regenerateThumbs } from '$lib/entries/store.svelte';
	import { formAction } from '$lib/form.svelte';
	import { type AutoLock, type CardClick, prefs, type Theme } from '$lib/prefs.svelte';
	import { tick } from 'svelte';
	import { REVEAL_MAX_MS, REVEAL_MIN_MS, REVEAL_MODES, REVEAL_STEP_MS, playReveal } from '$lib/reveal';

	// Aperçu du tirage sur une carte d'exemple, au choix d'un mode, d'une durée ou sur demande.
	let revealSample = $state<HTMLElement>();
	let sampleBorder = $state('');
	// Après le rendu : la bordure choisie pour l'exemple doit être posée avant de lire sa rareté.
	const previewReveal = () =>
		tick().then(
			() =>
				revealSample &&
				playReveal(revealSample, null, { mode: prefs.revealMode, random: prefs.revealRandom, duration: prefs.revealMs })
		);

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

	const CARD_CLICKS: { value: CardClick; label: string }[] = [
		{ value: 'zoom', label: 'Agrandir' },
		{ value: 'open', label: 'Ouvrir la fiche' }
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
		// Un nouveau mot de passe désactive Face ID partout (voir replacePassword).
		faceIdOn = false;
	});

	// Face ID : propre à cet appareil (voir faceId.ts).
	let faceIdAvailable = $state(false);
	faceIdSupported().then((supported) => (faceIdAvailable = supported));
	let faceIdOn = $state(!!session.user && !!readFaceId(session.user.uid));
	let faceIdOpen = $state(false);
	let faceIdPassword = $state('');
	let faceIdDisabled = $state(false);

	const faceIdForm = formAction(async () => {
		await enableFaceId(faceIdPassword);
		faceIdPassword = '';
		faceIdOpen = false;
		faceIdOn = true;
	});

	function disableFaceId() {
		forgetFaceId();
		faceIdOn = false;
		faceIdDisabled = true;
	}

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
	let thumbProgress = $state('');
	let thumbResult = $state<{ updated: number; failed: number } | null>(null);
	const thumbs = formAction(async () => {
		thumbResult = null;
		thumbResult = await regenerateThumbs((done, total) => (thumbProgress = `${done} / ${total}`));
	});

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

			<div class="flex flex-col gap-2">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Clic sur une carte</span>
					<span class="text-base-content/60 text-xs">Agrandir affiche la carte au-dessus de la liste, avec ses liens et un accès à la fiche. L'autre action reste à portée : la barre « Détails ».</span>
				</span>
				<div class="join" role="radiogroup" aria-label="Clic sur une carte">
					{#each CARD_CLICKS as option (option.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="card-click"
							value={option.value}
							aria-label={option.label}
							bind:group={prefs.cardClick}
						/>
					{/each}
				</div>
			</div>

			<!-- Révélation de la carte tirée au dé : trois façons, une durée, et un aperçu sur une carte d'exemple. -->
			<div class="flex flex-col gap-2">
				<span class="flex flex-col">
					<span class="flex items-center gap-1">
						<span class="text-sm font-medium">Tirage au hasard</span>
						<!-- Remélanger : une animation tirée au sort à chaque tirage, au lieu de celle choisie dessous. -->
						<button
							type="button"
							class="btn btn-ghost btn-xs btn-square {prefs.revealRandom ? 'text-primary' : 'text-base-content/40'}"
							aria-pressed={prefs.revealRandom}
							aria-label="Animation au hasard"
							title={prefs.revealRandom ? 'Animation au hasard : activée' : 'Animation au hasard : désactivée'}
							onclick={() => ((prefs.revealRandom = !prefs.revealRandom), previewReveal())}
						>
							<Icon name="shuffle" class="size-4" />
						</button>
					</span>
					<span class="text-base-content/60 text-xs">
						{prefs.revealRandom
							? 'Une des trois animations, différente à chaque tirage.'
							: REVEAL_MODES.find((mode) => mode.value === prefs.revealMode)?.hint}
					</span>
				</span>
				<div class="join {prefs.revealRandom ? 'opacity-50' : ''}" role="radiogroup" aria-label="Tirage au hasard">
					{#each REVEAL_MODES as mode (mode.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="reveal-mode"
							value={mode.value}
							aria-label={mode.label}
							bind:group={prefs.revealMode}
							onchange={previewReveal}
						/>
					{/each}
				</div>
				<div class="flex items-center gap-4">
					<div class="relative flex shrink-0 flex-col items-center gap-1">
						<div
							bind:this={revealSample}
							data-border={sampleBorder || undefined}
							class="bg-primary/10 text-primary rounded-box flex size-20 items-center justify-center text-4xl font-bold"
							aria-hidden="true"
						>
							S
						</div>
						<!-- Rareté de l'exemple : la révélation d'une carte or dure plus et jette des paillettes. -->
						<select class="select select-xs w-20" aria-label="Bordure de l'exemple" bind:value={sampleBorder} onchange={previewReveal}>
							<option value="">Sans</option>
							<option value="bronze">Bronze</option>
							<option value="silver">Argent</option>
							<option value="gold">Or</option>
						</select>
					</div>
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="text-xs">Durée : {(prefs.revealMs / 1000).toLocaleString('fr-FR')} s</span>
						<input
							type="range"
							class="range range-primary range-sm"
							min={REVEAL_MIN_MS}
							max={REVEAL_MAX_MS}
							step={REVEAL_STEP_MS}
							aria-label="Durée du tirage"
							bind:value={prefs.revealMs}
							onchange={previewReveal}
						/>
						<span class="text-base-content/60 flex justify-between text-xs" aria-hidden="true">
							<span>Rapide</span><span>Lente</span>
						</span>
					</label>
					<button type="button" class="btn btn-ghost btn-sm shrink-0" onclick={previewReveal}>
						<Icon name="dice" class="size-4" /> Aperçu
					</button>
				</div>
			</div>

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
			<a class="btn btn-outline btn-primary self-start" href="/ranking?from=settings"><Icon name="podium" class="size-4" /> Gérer le classement</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Tags</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Libellés libres propres à chaque collection, pour classer et filtrer vos fiches, chiffrés comme elles.</p>
			<a class="btn btn-outline btn-primary self-start" href="/tags?from=settings"><Icon name="tag" class="size-4" /> Gérer les tags</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Liens</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Sites propres à chaque collection : chaque fiche reçoit un lien calculé à partir de son nom.</p>
			<a class="btn btn-outline btn-primary self-start" href="/sites?from=settings"><Icon name="link" class="size-4" /> Gérer les liens</a>
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
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Corbeille</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Les fiches supprimées y restent {TRASH_DAYS} jours.</p>
			<a class="btn btn-outline btn-primary self-start" href="/trash"><Icon name="trash" class="size-4" /> Ouvrir la corbeille</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<form class="card-body gap-3" onsubmit={thumbs.submit}>
			<h2 class="card-title text-lg">Miniatures</h2>
			<p class="text-base-content/60 -mt-1 text-sm">
				Refait les miniatures trop petites depuis les images stockées, pour toutes les collections. Chaque fiche concernée
				télécharge son image : à lancer plutôt en Wi-Fi. Si c'est interrompu, relancez : seul le reste sera refait.
			</p>
			<ErrorAlert message={thumbs.error} />
			{#if thumbResult}
				<p role="status" class="alert alert-success alert-soft">
					{thumbResult.updated} miniature{thumbResult.updated > 1 ? 's' : ''} refaite{thumbResult.updated > 1 ? 's' : ''}.
					{#if thumbResult.failed}
						{thumbResult.failed} n'ont pas pu l'être : image illisible, ou format que ce navigateur n'encode pas (essayez sur un PC).
					{/if}
				</p>
			{/if}
			<button class="btn btn-outline btn-primary self-start" disabled={thumbs.busy}>
				{#if thumbs.busy}<span class="loading loading-spinner loading-sm"></span> {thumbProgress}{:else}Régénérer les miniatures{/if}
			</button>
		</form>
	</section>

	{#if faceIdAvailable || faceIdOn}
		<section class="card bg-base-100 shadow-sm">
			<div class="card-body gap-3">
				<h2 class="card-title text-lg">Face ID</h2>
				<p class="text-base-content/60 -mt-1 text-sm">
					Déverrouiller Stash sur cet appareil sans taper le mot de passe. Quiconque peut déverrouiller cet appareil,
					avec Face ID ou son code, pourra aussi ouvrir Stash. Changer de mot de passe désactive Face ID sur tous les
					appareils.
				</p>
				{#if faceIdOn}
					<p role="status" class="alert alert-success alert-soft text-sm">Activé sur cet appareil.</p>
					<button class="btn btn-outline btn-error self-start" onclick={disableFaceId}>Désactiver Face ID</button>
				{:else if faceIdOpen}
					<form class="flex flex-col gap-3" onsubmit={faceIdForm.submit}>
						<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
						<Field label="Mot de passe">
							<input class="input w-full" type="password" autocomplete="current-password" bind:value={faceIdPassword} required />
						</Field>
						<ErrorAlert message={faceIdForm.error} />
						<div class="flex gap-2">
							<button class="btn btn-primary" disabled={faceIdForm.busy}>
								{#if faceIdForm.busy}<span class="loading loading-spinner loading-sm"></span> Activation…{:else}Activer{/if}
							</button>
							<button type="button" class="btn btn-ghost" onclick={() => ((faceIdOpen = false), (faceIdPassword = ''))}>Annuler</button>
						</div>
					</form>
				{:else}
					{#if faceIdDisabled}
						<p role="status" class="text-base-content/70 text-sm">
							Face ID désactivé. La clé d'accès « Stash » de cet appareil ne sert plus : vous pouvez la supprimer dans
							Réglages › Mots de passe.
						</p>
					{/if}
					<button class="btn btn-outline btn-primary self-start" onclick={() => ((faceIdOpen = true), (faceIdDisabled = false))}>
						<Icon name="face" class="size-4" /> Activer Face ID
					</button>
				{/if}
			</div>
		</section>
	{/if}

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Changer de mot de passe</h2>
			<p class="text-base-content/60 -mt-2 text-sm">
				Vos fiches ne sont pas rechiffrées : seule votre clé l'est. Face ID est désactivé sur tous les appareils.
			</p>
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
					<button class="btn btn-outline btn-primary btn-sm" onclick={copyRecoveryKey}>
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
