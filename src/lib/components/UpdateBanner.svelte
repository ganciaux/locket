<script lang="ts">
	// Enregistre le service worker et propose la nouvelle version quand elle est prête.
	// Pas de rechargement automatique : il effacerait la DEK (l'app se verrouille) en pleine saisie.
	import { onMount } from 'svelte';

	let needRefresh = $state(false);
	let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		updateSW = registerSW({ immediate: true, onNeedRefresh: () => (needRefresh = true) });
	});
</script>

{#if needRefresh}
	<div class="toast toast-center z-20 pb-[calc(1rem+env(safe-area-inset-bottom))]">
		<div role="status" class="alert bg-base-100 shadow-lg">
			<span class="text-sm">Nouvelle version disponible.</span>
			<button class="btn btn-ghost btn-sm" onclick={() => (needRefresh = false)}>Plus tard</button>
			<button class="btn btn-primary btn-sm" onclick={() => updateSW?.(true)}>Recharger</button>
		</div>
	</div>
{/if}
