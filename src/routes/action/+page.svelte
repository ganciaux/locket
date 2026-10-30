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
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
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

<h1 class="card-title">Récupérer votre compte</h1>

{#if !session.ready}
	<span class="loading loading-spinner text-primary"></span>
{:else if signedInByLink && session.user}
	<p class="text-base-content/70 text-sm">Compte : <strong>{session.user.email}</strong></p>
	<form class="flex flex-col gap-4" onsubmit={recoveryForm.submit}>
		<input type="email" autocomplete="username" value={session.user.email} hidden readonly />
		<Field label="Clé de récupération">
			<input
				class="input w-full font-mono"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="ABCD-EFGH-…"
				bind:value={recoveryKey}
				required
			/>
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
		<ErrorAlert message={recoveryForm.error} />
		<button class="btn btn-primary" disabled={recoveryForm.busy}>
			{#if recoveryForm.busy}<span class="loading loading-spinner loading-sm"></span> Récupération…{:else}Récupérer
				le compte{/if}
		</button>
	</form>
{:else if hasLink}
	<p class="text-base-content/70 text-sm">Confirmez l'adresse email à laquelle le lien a été envoyé.</p>
	<form class="flex flex-col gap-4" onsubmit={linkForm.submit}>
		<Field label="Email">
			<input class="input w-full" type="email" autocomplete="username" bind:value={email} required />
		</Field>
		<ErrorAlert message={linkForm.error} />
		<button class="btn btn-primary" disabled={linkForm.busy}>
			{#if linkForm.busy}<span class="loading loading-spinner loading-sm"></span> Connexion…{:else}Continuer{/if}
		</button>
	</form>
	{#if linkForm.error}
		<a class="btn btn-outline" href="/mot-de-passe-oublie">Demander un nouveau lien</a>
	{/if}
{:else}
	<p role="alert" class="alert alert-warning alert-soft text-sm">Ce lien est invalide ou a déjà été utilisé.</p>
	<a class="btn btn-outline" href="/mot-de-passe-oublie">Demander un nouveau lien</a>
{/if}
