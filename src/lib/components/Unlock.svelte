<script lang="ts">
	import { unlock } from '$lib/auth/account';
	import { session, signOut } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import { formAction } from '$lib/form.svelte';

	let password = $state('');

	const form = formAction(async () => {
		await unlock(password);
		password = '';
	});
</script>

<h1 class="card-title">Déverrouiller</h1>
<p class="text-base-content/70 text-sm">Connecté en tant que <strong>{session.user?.email}</strong>.</p>

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<!-- Pour les gestionnaires de mots de passe. -->
	<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
	<Field label="Mot de passe">
		<!-- svelte-ignore a11y_autofocus -->
		<input class="input w-full" type="password" autocomplete="current-password" bind:value={password} required autofocus />
	</Field>
	<ErrorAlert message={form.error} />
	<button class="btn btn-primary" disabled={form.busy}>
		{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Déverrouillage…{:else}Déverrouiller{/if}
	</button>
</form>

<div class="flex justify-between text-sm">
	<a class="link link-primary" href="/forgot-password">Mot de passe oublié ?</a>
	<button class="link" onclick={signOut}>Se déconnecter</button>
</div>
