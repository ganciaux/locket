<script lang="ts">
	import { requestRecoveryLink } from '$lib/auth/account';
	import { session } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
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

<h1 class="card-title">Mot de passe oublié</h1>

{#if sent}
	<p role="status" class="alert alert-success alert-soft text-sm">
		Si un compte existe pour {email}, un email vient de lui être envoyé.
	</p>
	<p class="text-sm">
		Le lien qu'il contient vous connectera ; vous saisirez ensuite votre clé de récupération et un nouveau
		mot de passe.
	</p>
	<p class="text-base-content/70 text-sm">
		Sur iPhone, le lien s'ouvre dans Safari : terminez-y la récupération, puis revenez dans l'app.
	</p>
	{#if devLink}
		<a class="btn btn-outline btn-sm" href={devLink}>Émulateur : ouvrir le lien de connexion</a>
	{/if}
{:else}
	<p class="text-base-content/70 text-sm">
		Vous aurez besoin de la clé de récupération reçue à la création du compte.
	</p>
	<form class="flex flex-col gap-4" onsubmit={form.submit}>
		<Field label="Email">
			<input class="input w-full" type="email" autocomplete="username" bind:value={email} required />
		</Field>
		<ErrorAlert message={form.error} />
		<button class="btn btn-primary" disabled={form.busy}>
			{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Envoi…{:else}Envoyer le lien{/if}
		</button>
	</form>
{/if}

<a class="link link-primary text-sm" href="/connexion">Retour à la connexion</a>
