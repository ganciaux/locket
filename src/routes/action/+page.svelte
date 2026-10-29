<script lang="ts">
	// Récupération : le lien de connexion envoyé par /mot-de-passe-oublie mène ici.
	// Étape 1 : connexion par le lien. Étape 2 : clé de récupération + nouveau mot de passe.
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		MIN_PASSWORD_LENGTH,
		checkNewPassword,
		isRecoveryLink,
		recoverWithKey,
		rememberedRecoveryEmail,
		signInWithRecoveryLink
	} from '$lib/auth/account';
	import { session } from '$lib/auth/session.svelte';
	import { formAction } from '$lib/form.svelte';

	const link = page.url.href;
	const hasLink = isRecoveryLink(link);

	let email = $state(rememberedRecoveryEmail());
	let password = $state('');
	let confirmation = $state('');
	let recoveryKey = $state('');
	// Le changement de mot de passe exige une connexion récente : on se connecte toujours par le lien,
	// même si une session (ancienne) existe déjà dans ce navigateur.
	let signedInByLink = $state(false);

	const linkForm = formAction(async () => {
		await signInWithRecoveryLink(email, link);
		signedInByLink = true;
		// Lien consommé : inutile de le garder dans l'historique.
		replaceState('/action', {});
	});

	const recoveryForm = formAction(async () => {
		checkNewPassword(password, confirmation);
		await recoverWithKey(recoveryKey, password);
		await goto('/');
	});
</script>

<h1>Récupérer mes fiches</h1>

{#if !session.ready}
	<p>Chargement…</p>
{:else if signedInByLink && session.user}
	<p>Compte : <strong>{session.user.email}</strong></p>
	<form onsubmit={recoveryForm.submit}>
		<input type="email" autocomplete="username" value={session.user.email} hidden readonly />
		<label>
			Clé de récupération
			<input
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="ABCD-EFGH-…"
				bind:value={recoveryKey}
				required
			/>
		</label>
		<label>
			Nouveau mot de passe ({MIN_PASSWORD_LENGTH} caractères minimum)
			<input
				type="password"
				autocomplete="new-password"
				minlength={MIN_PASSWORD_LENGTH}
				bind:value={password}
				required
			/>
		</label>
		<label>
			Confirmation
			<input type="password" autocomplete="new-password" bind:value={confirmation} required />
		</label>
		{#if recoveryForm.error}<p class="error" role="alert">{recoveryForm.error}</p>{/if}
		<button disabled={recoveryForm.busy}>{recoveryForm.busy ? 'Récupération…' : 'Récupérer mes fiches'}</button>
	</form>
{:else if hasLink}
	<p>Confirmez l'adresse email à laquelle le lien a été envoyé.</p>
	<form onsubmit={linkForm.submit}>
		<label>
			Email
			<input type="email" autocomplete="username" bind:value={email} required />
		</label>
		{#if linkForm.error}<p class="error" role="alert">{linkForm.error}</p>{/if}
		<button disabled={linkForm.busy}>{linkForm.busy ? 'Connexion…' : 'Continuer'}</button>
	</form>
{:else}
	<p>Ce lien est invalide ou a déjà été utilisé.</p>
	<p><a href="/mot-de-passe-oublie">Demander un nouveau lien</a></p>
{/if}
