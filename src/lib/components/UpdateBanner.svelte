<script lang="ts">
	// Enregistre le service worker et propose la nouvelle version quand elle est prête.
	// Pas de rechargement automatique : il effacerait la DEK (l'app se verrouille) en pleine saisie.
	import { onMount } from 'svelte';

	let needRefresh = $state(false);
	let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

	// On recharge nous-mêmes quand la nouvelle version prend la main : `registerSW` ne le fait que si la mise à jour
	// a été détectée par cette page, pas si elle était déjà en attente (autre onglet, version trouvée au chargement).
	// Filet : s'il n'y avait rien en attente, aucun changement n'arrive ; on recharge quand même.
	function reload() {
		navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
		updateSW?.(true);
		setTimeout(() => location.reload(), 3000);
	}

	// Le navigateur ne cherche une mise à jour qu'au chargement : une PWA restée ouverte ne la verrait jamais.
	let registration: ServiceWorkerRegistration | undefined;
	function checkForUpdate() {
		if (document.visibilityState === 'visible') registration?.update().catch(() => {}); // hors ligne : prochain retour
	}

	onMount(() => {
		import('virtual:pwa-register').then(({ registerSW }) => {
			updateSW = registerSW({
				immediate: true,
				onNeedRefresh: () => (needRefresh = true),
				onRegisteredSW: (_url, reg) => (registration = reg)
			});
		});
		document.addEventListener('visibilitychange', checkForUpdate);
		return () => document.removeEventListener('visibilitychange', checkForUpdate);
	});
</script>

{#if needRefresh}
	<div class="toast toast-center z-20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
		<div role="status" class="alert bg-base-100 shadow-lg">
			<span class="text-sm">Nouvelle version disponible.</span>
			<button class="btn btn-ghost btn-sm" onclick={() => (needRefresh = false)}>Plus tard</button>
			<button class="btn btn-primary btn-sm" onclick={reload}>Recharger</button>
		</div>
	</div>
{/if}
