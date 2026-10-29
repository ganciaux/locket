<script lang="ts">
	import { MIN_PASSWORD_LENGTH, changePassword, checkNewPassword } from '$lib/auth/account';
	import { session, signOut } from '$lib/auth/session.svelte';
	import { formAction } from '$lib/form.svelte';
	import { prefs, type Theme } from '$lib/prefs.svelte';

	const THEMES: { value: Theme; label: string }[] = [
		{ value: 'auto', label: 'Automatique (système)' },
		{ value: 'light', label: 'Clair' },
		{ value: 'dark', label: 'Sombre' }
	];

	let currentPassword = $state('');
	let password = $state('');
	let confirmation = $state('');
	let changed = $state(false);

	const form = formAction(async () => {
		changed = false;
		checkNewPassword(password, confirmation);
		await changePassword(currentPassword, password);
		currentPassword = password = confirmation = '';
		changed = true;
	});
</script>

<h1>Paramètres</h1>
<p>Compte : <strong>{session.user?.email}</strong></p>

<h2>Affichage</h2>
<p class="hint">Réglages propres à cet appareil.</p>
<fieldset>
	<legend>Thème</legend>
	{#each THEMES as theme (theme.value)}
		<label class="check">
			<input type="radio" name="theme" value={theme.value} bind:group={prefs.theme} />
			{theme.label}
		</label>
	{/each}
</fieldset>
<p>
	<label class="check">
		<input type="checkbox" bind:checked={prefs.linksInNewTab} />
		Ouvrir les liens dans un nouvel onglet
	</label>
</p>
<p class="hint">Recommandé sur iPhone : sinon, ouvrir un lien fait quitter l'app.</p>

<h2>Changer de mot de passe</h2>
<form onsubmit={form.submit}>
	<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
	<label>
		Mot de passe actuel
		<input type="password" autocomplete="current-password" bind:value={currentPassword} required />
	</label>
	<label>
		Nouveau mot de passe ({MIN_PASSWORD_LENGTH} caractères minimum)
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
	{#if changed}<p role="status">Mot de passe modifié.</p>{/if}
	<button disabled={form.busy}>{form.busy ? 'Modification…' : 'Changer le mot de passe'}</button>
</form>

<p><a href="/">Retour</a></p>
<p><button class="link" onclick={signOut}>Se déconnecter</button></p>
