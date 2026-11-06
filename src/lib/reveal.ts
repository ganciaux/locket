/**
 * Tirage au hasard (dé) : la carte se révèle, puis un reflet de la couleur de sa bordure (or, argent…) ou blanc la
 * balaie. Trois façons de la révéler, au choix dans Paramètres, avec leur durée. Animations Web (pas de style en ligne :
 * CSP) ; un simple fondu si le système demande moins d'animations.
 */

export type RevealMode = 'pack' | 'flip' | 'glow';

export const REVEAL_MODES: { value: RevealMode; label: string; hint: string }[] = [
	{ value: 'pack', label: 'Paquet', hint: 'Floue et sombre, la carte tremble puis se dévoile d’un éclat.' },
	{ value: 'flip', label: 'Retournement', hint: 'La carte arrive de dos et se retourne.' },
	{ value: 'glow', label: 'Éclat', hint: 'La carte surgit d’une lumière blanche.' }
];

export const REVEAL_MIN_MS = 500;
export const REVEAL_MAX_MS = 3000;
export const REVEAL_STEP_MS = 100;
export const REVEAL_DEFAULT_MS = 1100;

/** Durée enregistrée : arrondie au pas, bornée ; autre chose → la durée par défaut. */
export function parseRevealMs(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return REVEAL_DEFAULT_MS;
	const rounded = Math.round(value / REVEAL_STEP_MS) * REVEAL_STEP_MS;
	return Math.min(Math.max(rounded, REVEAL_MIN_MS), REVEAL_MAX_MS);
}

export const parseRevealMode = (value: unknown): RevealMode =>
	REVEAL_MODES.find((mode) => mode.value === value)?.value ?? 'pack';

/** Images clés de la carte, et moment (de 0 à 1) où elle devient nette : le nom et le reflet s'y calent. */
type Reveal = { frames: Keyframe[]; easing: string; at: number };

const hidden = { filter: 'blur(16px) saturate(0.3) brightness(0.7)' };
const back = 'blur(2px) saturate(0) brightness(0.15)';

const REVEALS: Record<RevealMode, Reveal> = {
	pack: {
		easing: 'ease-in-out',
		at: 0.58,
		frames: [
			{ offset: 0, transform: 'scale(0.92) rotate(0deg)', ...hidden },
			{ offset: 0.12, transform: 'scale(0.93) rotate(-4deg)', ...hidden },
			{ offset: 0.22, transform: 'scale(0.94) rotate(4deg)', ...hidden },
			{ offset: 0.32, transform: 'scale(0.94) rotate(-3deg)', ...hidden },
			{ offset: 0.42, transform: 'scale(0.95) rotate(3deg)', ...hidden },
			{ offset: 0.52, transform: 'scale(0.95) rotate(-1.5deg)', ...hidden },
			{ offset: 0.58, transform: 'scale(0.95) rotate(0deg)', ...hidden },
			{ offset: 0.72, transform: 'scale(1.05) rotate(0deg)', filter: 'blur(0px) saturate(1.1) brightness(1.35)' },
			{ offset: 1, transform: 'scale(1) rotate(0deg)', filter: 'blur(0px) saturate(1) brightness(1)' }
		]
	},
	// De dos (sombre), la carte pivote jusqu'à la tranche, puis montre sa face en finissant de tourner.
	flip: {
		easing: 'ease-in-out',
		at: 0.45,
		frames: [
			{ offset: 0, transform: 'perspective(900px) rotateY(0deg) scale(0.94)', filter: back },
			{ offset: 0.15, transform: 'perspective(900px) rotateY(-12deg) scale(0.94)', filter: back },
			{ offset: 0.45, transform: 'perspective(900px) rotateY(90deg) scale(0.97)', filter: back },
			{ offset: 0.4501, transform: 'perspective(900px) rotateY(-90deg) scale(0.97)', filter: 'blur(0px) saturate(1.1) brightness(1.4)' },
			{ offset: 0.8, transform: 'perspective(900px) rotateY(0deg) scale(1.04)', filter: 'blur(0px) saturate(1.05) brightness(1.15)' },
			{ offset: 1, transform: 'perspective(900px) rotateY(0deg) scale(1)', filter: 'blur(0px) saturate(1) brightness(1)' }
		]
	},
	// Petite et surexposée, la carte grandit en perdant sa lumière.
	glow: {
		easing: 'ease-out',
		at: 0.35,
		frames: [
			{ offset: 0, transform: 'scale(0.6)', filter: 'blur(10px) brightness(3) saturate(0)', opacity: 0 },
			{ offset: 0.2, transform: 'scale(0.8)', filter: 'blur(6px) brightness(2.6) saturate(0.3)', opacity: 1 },
			{ offset: 0.35, transform: 'scale(1.08)', filter: 'blur(0px) brightness(1.8) saturate(1)', opacity: 1 },
			{ offset: 1, transform: 'scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', opacity: 1 }
		]
	}
};

const titleFrames = (at: number): Keyframe[] => [
	{ offset: 0, filter: 'blur(6px)', opacity: 0.4 },
	{ offset: at, filter: 'blur(6px)', opacity: 0.4 },
	{ offset: Math.min(at + 0.17, 1), filter: 'blur(0px)', opacity: 1 },
	{ offset: 1, filter: 'blur(0px)', opacity: 1 }
];

/** Reflet posé sur l'image le temps de l'animation (classe `reveal-sheen`, app.css), à partir du moment `at`. */
function sweep(image: HTMLElement, duration: number, at: number): void {
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
				{ offset: at, backgroundPosition: '160% 0', opacity: 1 },
				{ offset: 1, backgroundPosition: '-60% 0', opacity: 0 }
			],
			{ duration, easing: 'ease-out' }
		)
		.finished.finally(() => sheen.remove());
}

/** Joue la révélation sur l'image de la carte (et son nom) ; relancée, elle repart du début. */
export function playReveal(
	image: HTMLElement,
	title: HTMLElement | null | undefined,
	{ mode = 'pack', duration = REVEAL_DEFAULT_MS }: { mode?: RevealMode; duration?: number } = {}
): void {
	for (const element of [image, title]) element?.getAnimations().forEach((animation) => animation.cancel());
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
		return;
	}
	const reveal = REVEALS[parseRevealMode(mode)];
	const ms = parseRevealMs(duration);
	image.animate(reveal.frames, { duration: ms, easing: reveal.easing });
	title?.animate(titleFrames(reveal.at), { duration: ms, easing: 'ease-out' });
	sweep(image, ms, reveal.at);
}
