<script lang="ts">
	import { requestRecoveryLink } from '$lib/auth/account';
	import { session } from '$lib/auth/session.svelte';
	import { normalizeEmail } from '$lib/crypto/crypto';
	import { USE_EMULATORS, emulatorRecoveryLink } from '$lib/firebase';
	import { formAction } from '$lib/form.svelte';

	let email = $state(session.user?.email ?? '');
	let sent = $state(false);
	let devLink = $state<string | null>(null);

	const form = formAction(async () => {
		await requestRecoveryLink(email);
		sent = true;
		if (USE_EMULATORS) devLink = await emulatorRecoveryLink(normalizeEmail(email));
	});
</script>

<h1>Mot de passe oublié</h1>

{#if sent}
	<p>
		Si un compte existe pour <strong>{email}</strong>, un email vient de lui être envoyé. Le lien qu'il
		contient vous connectera ; vous saisirez ensuite votre clé de récupération et un nouveau mot de passe.
	</p>
	<p class="hint">Sur iPhone, le lien s'ouvre dans Safari : terminez-y la récupération, puis revenez dans l'app.</p>
	{#if devLink}
		<p class="hint">Émulateur : <a href={devLink}>ouvrir le lien de connexion</a></p>
	{/if}
{:else}
	<p class="hint">Vous aurez besoin de la clé de récupération reçue à la création du compte.</p>
	<form onsubmit={form.submit}>
		<label>
			Email
			<input type="email" autocomplete="username" bind:value={email} required />
		</label>
		{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
		<button disabled={form.busy}>{form.busy ? 'Envoi…' : 'Envoyer le lien'}</button>
	</form>
{/if}

<p><a href="/connexion">Retour à la connexion</a></p>
