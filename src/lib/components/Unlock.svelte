<script lang="ts">
	import { unlock } from '$lib/auth/account';
	import { session, signOut } from '$lib/auth/session.svelte';
	import { formAction } from '$lib/form.svelte';

	let password = $state('');

	const form = formAction(async () => {
		await unlock(password);
		password = '';
	});
</script>

<h1>Déverrouiller</h1>
<p>Connecté en tant que <strong>{session.user?.email}</strong>.</p>

<form onsubmit={form.submit}>
	<!-- Pour les gestionnaires de mots de passe. -->
	<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
	<label>
		Mot de passe
		<input type="password" autocomplete="current-password" bind:value={password} required />
	</label>
	{#if form.error}<p class="error" role="alert">{form.error}</p>{/if}
	<button disabled={form.busy}>{form.busy ? 'Déverrouillage…' : 'Déverrouiller'}</button>
</form>

<p><a href="/mot-de-passe-oublie">Mot de passe oublié ?</a></p>
<p><button class="link" onclick={signOut}>Se déconnecter</button></p>
