<script lang="ts">
	import { goto } from '$app/navigation';
	import { MIN_PASSWORD_LENGTH, checkNewPassword, signUp } from '$lib/auth/account';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
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
	<h1 class="card-title">Votre clé de récupération</h1>
	<p class="text-sm">
		Si vous oubliez votre mot de passe, elle seule permet de retrouver vos fiches.
	</p>
	<p role="alert" class="alert alert-warning alert-soft text-sm">
		Elle ne sera plus jamais affichée. Notez-la sur papier ou dans un gestionnaire de mots de passe.
	</p>
	<p
		class="border-primary bg-base-200 rounded-box border-2 border-dashed p-4 text-center font-mono text-lg tracking-wide break-all"
	>
		{recoveryKey}
	</p>
	<button type="button" class="btn btn-outline btn-sm self-start" onclick={copy}>
		<Icon name={copied ? 'check' : 'copy'} class="size-4" />
		{copied ? 'Copiée' : 'Copier'}
	</button>
	<label class="flex cursor-pointer items-center gap-3 text-sm">
		<input type="checkbox" class="checkbox checkbox-primary" bind:checked={saved} />
		J'ai conservé ma clé en lieu sûr
	</label>
	<button class="btn btn-primary" disabled={!saved} onclick={() => goto('/')}>Continuer</button>
{:else}
	<h1 class="card-title">Créer un compte</h1>
	<p class="text-base-content/70 text-sm">
		Votre mot de passe chiffre vos fiches dans ce navigateur : personne d'autre ne le connaît, pas même le
		serveur.
	</p>

	<form class="flex flex-col gap-4" onsubmit={form.submit}>
		<Field label="Email">
			<input class="input w-full" type="email" autocomplete="username" bind:value={email} required />
		</Field>
		<Field label="Mot de passe" hint="{MIN_PASSWORD_LENGTH} caractères minimum">
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
		<button class="btn btn-primary" disabled={form.busy}>
			{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Création…{:else}Créer le compte{/if}
		</button>
	</form>

	<p class="text-sm">Déjà un compte ? <a class="link link-primary" href="/login">Se connecter</a></p>
{/if}
