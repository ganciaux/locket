<script lang="ts">
	// Page d'action personnalisée (Console Firebase > Authentication > Modèles > URL d'action).
	// Remplace la page hébergée par Firebase, qui recevrait le vrai mot de passe.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		MIN_PASSWORD_LENGTH,
		checkNewPassword,
		checkResetCode,
		isWellFormedRecoveryKey,
		resetPassword,
		restoreWithRecoveryKey
	} from '$lib/auth/account';
	import { errorMessage } from '$lib/errors';
	import { formAction } from '$lib/form.svelte';

	const mode = page.url.searchParams.get('mode');
	const oobCode = page.url.searchParams.get('oobCode') ?? '';

	let email = $state('');
	let linkError = $state('');
	let password = $state('');
	let confirmation = $state('');
	let recoveryKey = $state('');
	// Renseignée une fois le mot de passe changé : si la clé de récupération est fausse,
	// on ne redemande qu'elle (le lien est déjà consommé).
	let newKek = $state.raw<CryptoKey | null>(null);

	if (mode === 'resetPassword') {
		checkResetCode(oobCode).then(
			(accountEmail) => (email = accountEmail),
			(error) => (linkError = errorMessage(error))
		);
	}

	const form = formAction(async () => {
		if (!newKek) {
			checkNewPassword(password, confirmation);
			if (!(await isWellFormedRecoveryKey(recoveryKey)))
				throw new Error('Clé de récupération mal formée : vérifiez chaque groupe de caractères.');
			newKek = await resetPassword(oobCode, email, password);
			password = confirmation = '';
		}
		await restoreWithRecoveryKey(recoveryKey, newKek);
		await goto('/');
	});
</script>

<h1>Nouveau mot de passe</h1>

{#if mode !== 'resetPassword'}
	<p>Ce lien n'est pas pris en charge.</p>
{:else if linkError}
	<p class="error" role="alert">{linkError}</p>
	<p><a href="/mot-de-passe-oublie">Demander un nouveau lien</a></p>
{:else if !email}
	<p>Vérification du lien…</p>
{:else}
	<p>Compte : <strong>{email}</strong></p>
	{#if newKek}
		<p>Votre mot de passe a été changé. Saisissez à nouveau votre clé de récupération pour retrouver vos fiches.</p>
	{/if}

	<form onsubmit={form.submit}>
		<input type="email" autocomplete="username" value={email} hidden readonly />
		{#if !newKek}
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
		{/if}
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
		{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
		<button disabled={form.busy}>{form.busy ? 'Récupération…' : 'Récupérer mes fiches'}</button>
	</form>
{/if}
