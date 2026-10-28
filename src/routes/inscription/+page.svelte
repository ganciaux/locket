<script lang="ts">
	import { goto } from '$app/navigation';
	import { MIN_PASSWORD_LENGTH, checkNewPassword, signUp } from '$lib/auth/account';
	import { formAction } from '$lib/form.svelte';

	let email = $state('');
	let password = $state('');
	let confirmation = $state('');
	let recoveryKey = $state('');
	let saved = $state(false);
	let copied = $state(false);

	const form = formAction(async () => {
		checkNewPassword(password, confirmation);
		recoveryKey = await signUp(email, password);
		password = confirmation = '';
	});

	async function copy() {
		await navigator.clipboard.writeText(recoveryKey);
		copied = true;
	}

	// La clé n'est affichée qu'une fois : on prévient avant de fermer l'onglet.
	function warnBeforeLeaving(event: BeforeUnloadEvent) {
		if (recoveryKey && !saved) event.preventDefault();
	}
</script>

<svelte:window onbeforeunload={warnBeforeLeaving} />

{#if recoveryKey}
	<h1>Votre clé de récupération</h1>
	<p>
		Si vous oubliez votre mot de passe, elle seule permet de retrouver vos fiches.
		<strong>Elle ne sera plus jamais affichée.</strong> Notez-la sur papier ou dans un gestionnaire de mots
		de passe.
	</p>
	<p class="recovery-key">{recoveryKey}</p>
	<p><button type="button" class="link" onclick={copy}>{copied ? 'Copiée' : 'Copier'}</button></p>
	<label class="check">
		<input type="checkbox" bind:checked={saved} />
		J'ai conservé ma clé en lieu sûr
	</label>
	<p><button disabled={!saved} onclick={() => goto('/')}>Continuer</button></p>
{:else}
	<h1>Créer un compte</h1>
	<p class="hint">
		Votre mot de passe chiffre vos fiches dans ce navigateur : personne d'autre ne le connaît, pas même
		le serveur.
	</p>

	<form onsubmit={form.submit}>
		<label>
			Email
			<input type="email" autocomplete="username" bind:value={email} required />
		</label>
		<label>
			Mot de passe ({MIN_PASSWORD_LENGTH} caractères minimum)
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
		{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
		<button disabled={form.busy}>{form.busy ? 'Création…' : 'Créer le compte'}</button>
	</form>

	<p>Déjà un compte ? <a href="/connexion">Se connecter</a></p>
{/if}
