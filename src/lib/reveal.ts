/**
 * Tirage au hasard (dé) : la carte arrive comme d'un paquet qu'on ouvre. Floue et sombre, elle tremble, puis se
 * dévoile d'un éclat, balayée par un reflet de la couleur de sa bordure (or, argent…) ou blanc.
 * Animations Web (pas de style en ligne : CSP) ; un simple fondu si le système demande moins d'animations.
 */

const DURATION_MS = 1100;

const hidden = { filter: 'blur(16px) saturate(0.3) brightness(0.7)' };
const revealFrames: Keyframe[] = [
	{ offset: 0, transform: 'scale(0.92) rotate(0deg)', ...hidden },
	{ offset: 0.12, transform: 'scale(0.93) rotate(-4deg)', ...hidden },
	{ offset: 0.22, transform: 'scale(0.94) rotate(4deg)', ...hidden },
	{ offset: 0.32, transform: 'scale(0.94) rotate(-3deg)', ...hidden },
	{ offset: 0.42, transform: 'scale(0.95) rotate(3deg)', ...hidden },
	{ offset: 0.52, transform: 'scale(0.95) rotate(-1.5deg)', ...hidden },
	{ offset: 0.58, transform: 'scale(0.95) rotate(0deg)', ...hidden },
	{ offset: 0.72, transform: 'scale(1.05) rotate(0deg)', filter: 'blur(0px) saturate(1.1) brightness(1.35)' },
	{ offset: 1, transform: 'scale(1) rotate(0deg)', filter: 'blur(0px) saturate(1) brightness(1)' }
];

const titleFrames: Keyframe[] = [
	{ offset: 0, filter: 'blur(6px)', opacity: 0.4 },
	{ offset: 0.58, filter: 'blur(6px)', opacity: 0.4 },
	{ offset: 0.75, filter: 'blur(0px)', opacity: 1 },
	{ offset: 1, filter: 'blur(0px)', opacity: 1 }
];

/** Reflet posé sur l'image le temps de l'animation (classe `reveal-sheen`, app.css). */
function sweep(image: HTMLElement): void {
	const parent = image.offsetParent;
	if (!(parent instanceof HTMLElement)) return;
	const sheen = document.createElement('span');
	sheen.className = 'reveal-sheen';
	sheen.setAttribute('aria-hidden', 'true');
	const color = getComputedStyle(image).getPropertyValue('--frame-light').trim();
	if (color) sheen.style.setProperty('--sheen', color);
	sheen.style.left = `${image.offsetLeft}px`;
	sheen.style.top = `${image.offsetTop}px`;
	sheen.style.width = `${image.offsetWidth}px`;
	sheen.style.height = `${image.offsetHeight}px`;
	parent.append(sheen);
	sheen
		.animate(
			[
				{ offset: 0, backgroundPosition: '160% 0', opacity: 0 },
				{ offset: 0.6, backgroundPosition: '160% 0', opacity: 1 },
				{ offset: 1, backgroundPosition: '-60% 0', opacity: 0 }
			],
			{ duration: DURATION_MS, easing: 'ease-out' }
		)
		.finished.finally(() => sheen.remove());
}

/** Joue la révélation sur l'image de la carte (et son nom) ; relancée, elle repart du début. */
export function playReveal(image: HTMLElement, title?: HTMLElement | null): void {
	for (const element of [image, title]) element?.getAnimations().forEach((animation) => animation.cancel());
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
		return;
	}
	image.animate(revealFrames, { duration: DURATION_MS, easing: 'ease-in-out' });
	title?.animate(titleFrames, { duration: DURATION_MS, easing: 'ease-out' });
	sweep(image);
}
