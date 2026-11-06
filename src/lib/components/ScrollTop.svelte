<script lang="ts">
	// Retour en haut d'une page longue (liste, index, classement…) : visible dès un demi-écran de défilement,
	// en bas à gauche (le « + » est à droite), au-dessus d'un bandeau fixé. Caché par `invisible` (ni clic, ni focus,
	// ni lecteur d'écran), qui n'agit qu'à la fin du fondu. L'anneau montre où l'on en est de la page.
	import Icon from '$lib/components/Icon.svelte';
	import { dock } from '$lib/dock.svelte';
	import { scrollToTop } from '$lib/scrollTop';

	let button = $state<HTMLButtonElement>();
	let shown = $state(false);
	let progress = $state(0);
	let pending = false;

	function measure() {
		pending = false;
		const max = document.documentElement.scrollHeight - innerHeight;
		shown = scrollY > innerHeight * 0.5;
		progress = max > 0 ? Math.min(scrollY / max, 1) : 0;
	}

	// Une mesure par image, pas à chaque événement de défilement.
	function schedule() {
		if (pending) return;
		pending = true;
		requestAnimationFrame(measure);
	}

	// Position posée en CSSOM (la CSP refuse les attributs style) : au-dessus du bandeau, ou du bas de l'écran.
	$effect(() => {
		if (!button) return;
		button.style.bottom = dock.height ? `${dock.height + 16}px` : 'calc(1.5rem + env(safe-area-inset-bottom))';
	});

	function top() {
		// Le bouton disparaît en haut : le focus passe au contenu de la page, sans la faire défiler.
		scrollToTop(() => document.querySelector('main')?.focus({ preventScroll: true }));
	}
</script>

<svelte:window onscroll={schedule} onresize={schedule} />

<button
	bind:this={button}
	type="button"
	class="btn btn-circle bg-base-100 text-primary border-base-300 fixed left-4 z-20 size-12 shadow-lg transition duration-200 {shown
		? 'scale-100 opacity-100'
		: 'invisible translate-y-3 scale-75 opacity-0'}"
	aria-label="Revenir en haut"
	title="Revenir en haut"
	onclick={top}
>
	<svg viewBox="0 0 48 48" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
		<circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-15" />
		<circle
			cx="24"
			cy="24"
			r="21"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			pathLength="100"
			stroke-dasharray="100"
			stroke-dashoffset={100 - progress * 100}
			transform="rotate(-90 24 24)"
		/>
	</svg>
	<Icon name="chevronUp" class="size-6" />
</button>
