<script lang="ts">
	// Page de test JETABLE (chantier Face ID, voir MEMORY.md) : l'iPhone, dans l'app installée, fournit-il l'extension
	// WebAuthn `prf` avec Face ID ? Si oui, une clé dérivée par PRF pourrait emballer la DEK, comme la clé de récupération.
	// Rien n'est écrit dans Firebase ni lié aux fiches ; la sortie PRF n'est ni gardée ni affichée, seulement comparée.
	// À supprimer une fois la réponse connue (route, lien dans Paramètres, clé `locket.prfTest`).
	import { onMount } from 'svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { fromBase64, toBase64 } from '$lib/crypto/encoding';

	// Identifiant de la clé d'accès de test : pas un secret, gardé pour refaire l'essai après avoir rouvert l'app.
	const STORE = 'locket.prfTest';
	const SALT = new TextEncoder().encode('locket/prf-test/v1');

	let log = $state<string[]>([]);
	let credentialId = $state<string | null>(null);
	let busy = $state(false);
	let lastOutput: Uint8Array | null = null;

	function add(line: string): void {
		log = [...log, line];
	}
	const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
	type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
	const prfOf = (credential: PublicKeyCredential) => (credential.getClientExtensionResults() as PrfResults).prf;
	const prfInput = { prf: { eval: { first: SALT } } } as AuthenticationExtensionsClientInputs;

	onMount(async () => {
		try {
			credentialId = localStorage.getItem(STORE);
		} catch {
			credentialId = null;
		}
		const standalone =
			matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
		add(`Navigateur : ${navigator.userAgent}`);
		add(`App installée (écran d'accueil) : ${standalone ? 'oui' : 'non'}`);
		if (!('PublicKeyCredential' in window)) return add('WebAuthn : absent ✗');
		add(`Face ID / Touch ID disponible : ${(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) ? 'oui' : 'non'}`);
		const withCapabilities = PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> };
		const capabilities = withCapabilities.getClientCapabilities ? await withCapabilities.getClientCapabilities() : null;
		add(`Extension prf annoncée : ${capabilities ? String(capabilities['extension:prf'] ?? 'non précisé') : 'API de capacités absente'}`);
		add(credentialId ? 'Clé de test déjà créée sur cet appareil : passer à l’étape 2.' : 'Aucune clé de test : commencer par l’étape 1.');
	});

	async function run(step: () => Promise<void>) {
		busy = true;
		try {
			await step();
		} catch (e) {
			const error = e as DOMException;
			add(`Erreur : ${error.name} — ${error.message}`);
		} finally {
			busy = false;
		}
	}

	const create = () =>
		run(async () => {
			const credential = (await navigator.credentials.create({
				publicKey: {
					rp: { name: 'Stash (test Face ID)', id: location.hostname },
					user: { id: random(16), name: 'test-face-id', displayName: 'Test Face ID Stash' },
					challenge: random(32),
					pubKeyCredParams: [
						{ type: 'public-key', alg: -7 },
						{ type: 'public-key', alg: -257 }
					],
					authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
					extensions: prfInput
				}
			})) as PublicKeyCredential | null;
			if (!credential) return add('Création : annulée.');
			const prf = prfOf(credential);
			add(`Étape 1 : clé créée ; prf.enabled = ${String(prf?.enabled)} ; sortie dès la création : ${prf?.results?.first ? 'oui' : 'non'}`);
			credentialId = toBase64(new Uint8Array(credential.rawId));
			try {
				localStorage.setItem(STORE, credentialId);
			} catch {
				add('Identifiant non mémorisé (stockage indisponible) : refaire l’essai sans fermer l’app.');
			}
		});

	const evaluate = () =>
		run(async () => {
			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: random(32),
					rpId: location.hostname,
					allowCredentials: credentialId ? [{ type: 'public-key', id: fromBase64(credentialId) }] : [],
					userVerification: 'required',
					extensions: prfInput
				}
			})) as PublicKeyCredential | null;
			if (!assertion) return add('Étape 2 : annulée.');
			const first = prfOf(assertion)?.results?.first;
			if (!first) return add('Étape 2 : Face ID accepté, mais aucune sortie PRF ✗ (Face ID ne pourra pas déverrouiller)');
			const output = new Uint8Array(first);
			const same = lastOutput && lastOutput.length === output.length && lastOutput.every((byte, i) => byte === output[i]);
			add(
				`Étape 2 : sortie PRF de ${output.length} octets ✓${lastOutput ? (same ? ' ; identique à l’essai précédent ✓' : ' ; DIFFÉRENTE de l’essai précédent ✗') : ' ; refaire l’étape 2 pour comparer'}`
			);
			lastOutput = output;
		});

	function forget() {
		try {
			localStorage.removeItem(STORE);
		} catch {
			// rien à oublier
		}
		credentialId = null;
		lastOutput = null;
		add('Clé de test oubliée par l’app. La supprimer aussi dans Réglages › Mots de passe (« Stash (test Face ID) »).');
	}
</script>

<a href="/settings" class="btn btn-ghost btn-sm mb-4 -ml-2"><Icon name="back" class="size-4" /> Paramètres</a>
<h1 class="mb-2 text-2xl font-bold">Test Face ID (temporaire)</h1>
<p class="text-base-content/70 mb-4 text-sm">
	Vérifie si cet iPhone peut dériver une clé avec Face ID (extension WebAuthn « prf »), à faire dans l'app installée.
	Rien ne touche à vos fiches ni à votre compte. L'étape 1 crée une clé d'accès « Stash (test Face ID) » dans le trousseau
	iCloud, à supprimer ensuite dans Réglages › Mots de passe.
</p>

<div class="card bg-base-100 mb-4 shadow-sm">
	<div class="card-body gap-3">
		<div class="flex flex-wrap gap-2">
			<button class="btn btn-primary" disabled={busy} onclick={create}>1. Créer la clé de test</button>
			<button class="btn btn-primary" disabled={busy} onclick={evaluate}>2. Tester Face ID</button>
		</div>
		<p class="text-base-content/60 text-xs">
			Faire l'étape 2 deux fois : la sortie doit être identique. Puis fermer complètement l'app, la rouvrir et refaire
			l'étape 2 : elle doit encore marcher.
		</p>
		{#if credentialId}
			<button class="btn btn-ghost btn-sm self-start" disabled={busy} onclick={forget}>Oublier la clé de test</button>
		{/if}
	</div>
</div>

<div class="card bg-base-100 shadow-sm">
	<div class="card-body gap-2">
		<div class="flex items-center gap-2">
			<h2 class="flex-1 font-semibold">Rapport</h2>
			<CopyButton text={log.join('\n')} label="Copier le rapport" />
		</div>
		<ol class="flex flex-col gap-1 font-mono text-xs break-words" role="log">
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ol>
	</div>
</div>
