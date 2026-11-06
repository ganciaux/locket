/**
 * Retour en haut de page animé (bouton `ScrollTop`) : la durée croît avec la distance, bornée, pour qu'une longue
 * liste remonte vite sans téléporter. Courbe qui accélère puis se pose en douceur ; un geste de l'utilisateur
 * (molette, toucher, touche) l'interrompt. Instantané si le système demande moins d'animations.
 */

export const SCROLL_MIN_MS = 350;
export const SCROLL_MAX_MS = 900;

/** Durée de la remontée : 350 ms plus 1 ms pour 12 px, au plus 900 ms (atteint vers 6 600 px). */
export const scrollDuration = (distance: number): number =>
	Math.round(Math.min(SCROLL_MAX_MS, SCROLL_MIN_MS + Math.max(distance, 0) / 12));

/** Accélère puis ralentit (cubique) : de 0 à 1. */
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

const INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/** Remonte en haut de la page ; `done` à l'arrivée (pas si l'utilisateur a repris la main). */
export function scrollToTop(done?: () => void): void {
	const start = window.scrollY;
	if (start <= 0) return done?.();
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		window.scrollTo(0, 0);
		return done?.();
	}
	const duration = scrollDuration(start);
	const begin = performance.now();
	let stopped = false;
	const stop = () => (stopped = true);
	const cleanup = () => INTERRUPTS.forEach((type) => removeEventListener(type, stop));
	INTERRUPTS.forEach((type) => addEventListener(type, stop, { passive: true }));
	const step = (now: number) => {
		if (stopped) return cleanup();
		const t = Math.min((now - begin) / duration, 1);
		window.scrollTo(0, start * (1 - easeInOutCubic(t)));
		if (t < 1) return void requestAnimationFrame(step);
		cleanup();
		done?.();
	};
	requestAnimationFrame(step);
}
