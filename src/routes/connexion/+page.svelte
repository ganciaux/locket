<script lang="ts">
	import { goto } from '$app/navigation';
	import { signIn } from '$lib/auth/account';
	import { formAction } from '$lib/form.svelte';

	let email = $state('');
	let password = $state('');

	const form = formAction(async () => {
		await signIn(email, password);
		password = '';
		await goto('/');
	});
</script>

<h1>Connexion</h1>

<form onsubmit={form.submit}>
	<label>
		Email
		<input type="email" autocomplete="username" bind:value={email} required />
	</label>
	<label>
		Mot de passe
		<input type="password" autocomplete="current-password" bind:value={password} required />
	</label>
	{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
	<button disabled={form.busy}>{form.busy ? 'Connexion…' : 'Se connecter'}</button>
</form>

<p><a href="/mot-de-passe-oublie">Mot de passe oublié ?</a></p>
<p>Pas encore de compte ? <a href="/inscription">Créer un compte</a></p>
