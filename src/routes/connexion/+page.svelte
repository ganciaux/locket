<script lang="ts">
	import { goto } from '$app/navigation';
	import { signIn } from '$lib/auth/account';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import { formAction } from '$lib/form.svelte';

	let email = $state('');
	let password = $state('');

	const form = formAction(async () => {
		await signIn(email, password);
		password = '';
		await goto('/');
	});
</script>

<h1 class="card-title">Connexion</h1>

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<Field label="Email">
		<input class="input w-full" type="email" autocomplete="username" bind:value={email} required />
	</Field>
	<Field label="Mot de passe">
		<input class="input w-full" type="password" autocomplete="current-password" bind:value={password} required />
	</Field>
	<ErrorAlert message={form.error} />
	<button class="btn btn-primary" disabled={form.busy}>
		{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Connexion…{:else}Se connecter{/if}
	</button>
</form>

<div class="flex flex-col gap-1 text-sm">
	<a class="link link-primary" href="/mot-de-passe-oublie">Mot de passe oublié ?</a>
	<p>Pas encore de compte ? <a class="link link-primary" href="/inscription">Créer un compte</a></p>
</div>
