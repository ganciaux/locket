<script lang="ts">
	// Verrouille l'app (oubli de la DEK) après `prefs.autoLockMinutes` sans interaction.
	// On compare des heures plutôt que de compter sur un minuteur : iOS suspend les minuteurs
	// d'une app en arrière-plan, d'où la vérification au retour au premier plan.
	import { lock } from '$lib/auth/session.svelte';
	import { prefs } from '$lib/prefs.svelte';

	const CHECK_EVERY_MS = 15_000;
	const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

	let lastActivity = Date.now();

	function checkIdle() {
		const minutes = prefs.autoLockMinutes;
		if (minutes && Date.now() - lastActivity >= minutes * 60_000) lock();
	}

	$effect(() => {
		const markActive = () => (lastActivity = Date.now());
		const onVisibility = () => document.visibilityState === 'visible' && checkIdle();
		for (const type of ACTIVITY_EVENTS) window.addEventListener(type, markActive, { passive: true });
		document.addEventListener('visibilitychange', onVisibility);
		const timer = setInterval(checkIdle, CHECK_EVERY_MS);
		return () => {
			for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, markActive);
			document.removeEventListener('visibilitychange', onVisibility);
			clearInterval(timer);
		};
	});
</script>
