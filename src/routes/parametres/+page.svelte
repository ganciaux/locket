<script lang="ts">
	import { MIN_PASSWORD_LENGTH, changePassword, checkNewPassword } from '$lib/auth/account';
	import { session, signOut } from '$lib/auth/session.svelte';
	import ErrorAlert from '$lib/components/ErrorAlert.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { formAction } from '$lib/form.svelte';
	import { type AutoLock, prefs, type Theme } from '$lib/prefs.svelte';

	const THEMES: { value: Theme; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'light', label: 'Clair' },
		{ value: 'dark', label: 'Sombre' }
	];

	const AUTO_LOCKS: { value: AutoLock; label: string }[] = [
		{ value: 1, label: '1 min' },
		{ value: 5, label: '5 min' },
		{ value: 15, label: '15 min' },
		{ value: 30, label: '30 min' },
		{ value: 0, label: 'Jamais' }
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

<a href="/" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Mes fiches</a>
<h1 class="mb-6 text-2xl font-bold">Paramètres</h1>

<div class="flex flex-col gap-6">
	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Affichage</h2>
			<p class="text-base-content/60 -mt-2 text-sm">Réglages propres à cet appareil.</p>

			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium">Thème</span>
				<div class="join" role="radiogroup" aria-label="Thème">
					{#each THEMES as theme (theme.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="theme"
							value={theme.value}
							aria-label={theme.label}
							bind:group={prefs.theme}
						/>
					{/each}
				</div>
			</div>

			<label class="flex cursor-pointer items-start justify-between gap-4">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Ouvrir les liens dans un nouvel onglet</span>
					<span class="text-base-content/60 text-xs">Recommandé sur iPhone : sinon, ouvrir un lien fait quitter l'app.</span>
				</span>
				<input type="checkbox" class="toggle toggle-primary" bind:checked={prefs.linksInNewTab} />
			</label>

			<div class="flex flex-col gap-2">
				<span class="flex flex-col">
					<span class="text-sm font-medium">Verrouillage automatique</span>
					<span class="text-base-content/60 text-xs">Après ce délai sans utilisation, le mot de passe est redemandé.</span>
				</span>
				<div class="join" role="radiogroup" aria-label="Verrouillage automatique">
					{#each AUTO_LOCKS as option (option.value)}
						<input
							class="join-item btn btn-sm"
							type="radio"
							name="auto-lock"
							value={option.value}
							aria-label={option.label}
							bind:group={prefs.autoLockMinutes}
						/>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Collections</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Manga, Chanteurs, Sportifs… : chaque fiche appartient à une collection.</p>
			<a class="btn btn-outline btn-primary self-start" href="/collections"><Icon name="folder" class="size-4" /> Gérer les collections</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Tags</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Libellés libres propres à chaque collection, pour classer et filtrer vos fiches, chiffrés comme elles.</p>
			<a class="btn btn-outline btn-primary self-start" href="/tags"><Icon name="tag" class="size-4" /> Gérer les tags</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Sauvegarde</h2>
			<p class="text-base-content/60 -mt-1 text-sm">Exporter vos fiches chiffrées dans un fichier, ou les restaurer.</p>
			<a class="btn btn-outline btn-primary self-start" href="/sauvegarde"><Icon name="import" class="size-4" /> Sauvegarder / restaurer</a>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="card-title text-lg">Changer de mot de passe</h2>
			<p class="text-base-content/60 -mt-2 text-sm">Vos fiches ne sont pas rechiffrées : seule votre clé l'est.</p>
			<form class="flex flex-col gap-4" onsubmit={form.submit}>
				<input type="email" autocomplete="username" value={session.user?.email} hidden readonly />
				<Field label="Mot de passe actuel">
					<input class="input w-full" type="password" autocomplete="current-password" bind:value={currentPassword} required />
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
				<ErrorAlert message={form.error} />
				{#if changed}<p role="status" class="alert alert-success alert-soft text-sm">Mot de passe modifié.</p>{/if}
				<button class="btn btn-primary self-start" disabled={form.busy}>
					{#if form.busy}<span class="loading loading-spinner loading-sm"></span> Modification…{:else}Changer le mot de passe{/if}
				</button>
			</form>
		</div>
	</section>

	<section class="card bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<h2 class="card-title text-lg">Compte</h2>
			<p class="text-sm break-all">{session.user?.email}</p>
			<button class="btn btn-outline btn-error self-start" onclick={signOut}>Se déconnecter</button>
		</div>
	</section>
</div>
