<script lang="ts">
	import { PASSWORD_DUE, unlock, unlockWithFaceId } from '$lib/auth/account';
	import { passwordDue, readFaceId } from '$lib/auth/faceId';
	import { session, signOut } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { formAction } from '$lib/form.svelte';

	let password = $state('');
	// Face ID activé sur cet appareil : son bouton passe en premier, sans ouvrir le clavier. Sauf quand le mot de passe
	// est redemandé (tous les 30 jours) : Face ID revient au déverrouillage suivant.
	const record = () => (session.user ? readFaceId(session.user.uid) : null);
	const initial = record();
	const due = !!initial && passwordDue(initial);
	let faceId = $state(!!initial && !due);

	const form = formAction(async () => {
		await unlock(password);
		password = '';
	});

	const faceForm = formAction(async () => {
		try {
			await unlockWithFaceId();
		} finally {
			faceId = !!record();
		}
	});
</script>

<h1 class="card-title">Déverrouiller</h1>
<p class="text-base-content/70 text-sm">Connecté en tant que <strong>{session.user?.email}</strong>.</p>

{#if faceId}
	<form class="flex flex-col gap-2" onsubmit={faceForm.submit}>
		<button class="btn btn-primary" disabled={faceForm.busy}>
			{#if faceForm.busy}<span class="loading loading-spinner loading-sm"></span>{:else}<Icon name="face" class="size-5" />{/if}
			Déverrouiller avec Face ID
		</button>
	</form>
{:else if due}
	<p role="status" class="alert alert-info alert-soft text-sm">{PASSWORD_DUE}</p>
{/if}
<ErrorAlert message={faceForm.error} />

<form class="flex flex-col gap-4" onsubmit={form.submit}>
	<!-- Pour les gestionnaires de mots de passe. -->
	<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
	<Field label="Mot de passe">
		{#if faceId}
			<input class="input w-full" type="password" autocomplete="current-password" bind:value={password} required />
		{:else}
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input w-full" type="password" autocomplete="current-password" bind:value={password} required autofocus />
		{/if}
	</Field>
	<ErrorAlert message={form.error} />
	<button class="btn {faceId ? 'btn-outline btn-primary' : 'btn-primary'}" disabled={form.busy}>
		{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Déverrouillage…{:else}Déverrouiller{/if}
	</button>
</form>

<div class="flex justify-between text-sm">
	<a class="link link-primary" href="/forgot-password">Mot de passe oublié ?</a>
	<button class="link" onclick={signOut}>Se déconnecter</button>
</div>
