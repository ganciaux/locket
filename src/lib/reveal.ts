/**
 * Tirage au hasard (dé) : la carte se révèle, puis un reflet de la couleur de sa bordure (or, argent…) ou blanc la
 * balaie. Trois façons de la révéler, au choix dans Paramètres (ou tirée au sort), avec leur durée. Plus la carte est
 * rare (bordure bronze, argent, or), plus la révélation dure et plus elle jette de paillettes.
 * Animations Web (pas de style en ligne : CSP) ; un simple fondu si le système demande moins d'animations.
 */

export type RevealMode = 'pack' | 'flip' | 'glow';

export const REVEAL_MODES: { value: RevealMode; label: string; hint: string }[] = [
	{ value: 'pack', label: 'Paquet', hint: 'Floue et sombre, la carte tremble puis se dévoile d’un éclat.' },
	{ value: 'flip', label: 'Retournement', hint: 'La carte arrive de dos et se retourne.' },
	{ value: 'glow', label: 'Éclat', hint: 'La carte surgit d’une lumière blanche.' }
];

/** Rareté lue sur la bordure de la carte : durée allongée, nombre de paillettes. Les autres couleurs restent sobres. */
const RARITY: Record<string, { stretch: number; sparks: number }> = {
	gold: { stretch: 1.3, sparks: 16 },
	silver: { stretch: 1.15, sparks: 9 },
	bronze: { stretch: 1.05, sparks: 5 }
};

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

// Carte encore cachée (Paquet, et le dos du Retournement) : assez floue et terne pour ne pas la reconnaître.
const hidden = { filter: 'blur(22px) saturate(0.1) brightness(0.55)' };
const back = hidden.filter;

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
	// Courbes par segment : la carte est nette au moment `at`, quand partent le reflet et les paillettes.
	glow: {
		easing: 'linear',
		at: 0.35,
		frames: [
			{ offset: 0, transform: 'scale(0.6)', filter: 'blur(10px) brightness(3) saturate(0)', opacity: 0, easing: 'ease-out' },
			{ offset: 0.2, transform: 'scale(0.8)', filter: 'blur(6px) brightness(2.6) saturate(0.3)', opacity: 1, easing: 'ease-in' },
			{ offset: 0.35, transform: 'scale(1.08)', filter: 'blur(0px) brightness(1.8) saturate(1)', opacity: 1, easing: 'ease-out' },
			{ offset: 1, transform: 'scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', opacity: 1 }
		]
	}
};

// Courbes sur le seul segment en mouvement : posée sur toute l'animation, elle décalerait le moment t.
const titleFrames = (at: number): Keyframe[] => [
	{ offset: 0, filter: 'blur(6px)', opacity: 0.4 },
	{ offset: at, filter: 'blur(6px)', opacity: 0.4, easing: 'ease-out' },
	{ offset: Math.min(at + 0.17, 1), filter: 'blur(0px)', opacity: 1 },
	{ offset: 1, filter: 'blur(0px)', opacity: 1 }
];

/** Élément posé sur l'image le temps de l'animation (`reveal-sheen`, `reveal-spark` : app.css), retiré à la fin. */
function overlay(image: HTMLElement, className: string, color: string): HTMLSpanElement | null {
	const parent = image.offsetParent;
	if (!(parent instanceof HTMLElement)) return null;
	const element = document.createElement('span');
	element.className = className;
	element.setAttribute('aria-hidden', 'true');
	if (color) element.style.setProperty('--sheen', color);
	parent.append(element);
	return element;
}

/** Reflet qui balaie l'image à partir du moment `at`. */
function sweep(image: HTMLElement, color: string, duration: number, at: number): void {
	const sheen = overlay(image, 'reveal-sheen', color);
	if (!sheen) return;
	sheen.style.left = `${image.offsetLeft}px`;
	sheen.style.top = `${image.offsetTop}px`;
	sheen.style.width = `${image.offsetWidth}px`;
	sheen.style.height = `${image.offsetHeight}px`;
	sheen
		.animate(
			[
				{ offset: 0, backgroundPosition: '160% 0', opacity: 0 },
				{ offset: at, backgroundPosition: '160% 0', opacity: 1, easing: 'ease-out' },
				{ offset: 1, backgroundPosition: '-60% 0', opacity: 0 }
			],
			{ duration }
		)
		.finished.finally(() => sheen.remove());
}

/** Paillettes jetées du centre de l'image au moment où elle se révèle, dans toutes les directions. */
function sparkle(image: HTMLElement, color: string, count: number, duration: number, at: number): void {
	const centerX = image.offsetLeft + image.offsetWidth / 2;
	const centerY = image.offsetTop + image.offsetHeight / 2;
	const reach = Math.max(image.offsetWidth, image.offsetHeight) / 2;
	for (let i = 0; i < count; i++) {
		const spark = overlay(image, 'reveal-spark', color);
		if (!spark) return;
		const size = 4 + Math.random() * 6;
		spark.style.left = `${centerX - size / 2}px`;
		spark.style.top = `${centerY - size / 2}px`;
		spark.style.width = spark.style.height = `${size}px`;
		const angle = (i / count) * 2 * Math.PI + Math.random() * 0.5;
		const distance = reach * (0.9 + Math.random() * 0.9);
		const x = Math.cos(angle) * distance;
		const y = Math.sin(angle) * distance;
		const start = Math.min(at + Math.random() * 0.06, 0.9);
		const burst = start + 0.03;
		// Jaillit, brille en filant (jusqu'aux trois quarts du chemin), puis s'éteint en ralentissant.
		const glide = burst + (1 - burst) * 0.6;
		spark
			.animate(
				[
					{ offset: 0, transform: 'translate(0, 0) scale(0)', opacity: 0 },
					{ offset: start, transform: 'translate(0, 0) scale(0)', opacity: 0 },
					{ offset: burst, transform: 'translate(0, 0) scale(1.3)', opacity: 1, easing: 'ease-out' },
					{
						offset: glide,
						transform: `translate(${x * 0.75}px, ${y * 0.75}px) scale(1)`,
						opacity: 0.95,
						easing: 'ease-in'
					},
					{ offset: 1, transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 0 }
				],
				{ duration }
			)
			.finished.finally(() => spark.remove());
	}
}

let lastRandom: RevealMode | undefined;

/** Animation à jouer : celle choisie, ou tirée au sort (jamais deux fois la même de suite). */
export function pickAnimation(mode: RevealMode, random: boolean, draw = Math.random): RevealMode {
	if (!random) return mode;
	const choices = REVEAL_MODES.map((option) => option.value).filter((value) => value !== lastRandom);
	lastRandom = choices[Math.floor(draw() * choices.length)];
	return lastRandom;
}

/** Durée réelle : la durée réglée, allongée selon la rareté de la bordure (or, argent, bronze). */
export const revealDuration = (duration: number, border: string | null | undefined): number =>
	Math.round(parseRevealMs(duration) * (RARITY[border ?? '']?.stretch ?? 1));

/**
 * Joue la révélation sur l'image de la carte (et son nom) ; relancée, elle repart du début. La rareté est lue sur
 * l'image (`data-border`), sa couleur claire (`--frame-light`) colore le reflet et les paillettes.
 */
export function playReveal(
	image: HTMLElement,
	title: HTMLElement | null | undefined,
	{ mode = 'pack', random = false, duration = REVEAL_DEFAULT_MS }: { mode?: RevealMode; random?: boolean; duration?: number } = {}
): void {
	for (const element of [image, title]) element?.getAnimations().forEach((animation) => animation.cancel());
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
		return;
	}
	const reveal = REVEALS[pickAnimation(parseRevealMode(mode), random)];
	const border = image.getAttribute('data-border');
	const ms = revealDuration(duration, border);
	const style = getComputedStyle(image);
	const color = style.getPropertyValue('--frame-light').trim();
	// Paillettes de la couleur franche du cadre : la teinte claire du reflet disparaîtrait sur un fond clair.
	const sparkColor = style.getPropertyValue('--frame-color').trim() || color;
	image.animate(reveal.frames, { duration: ms, easing: reveal.easing });
	title?.animate(titleFrames(reveal.at), { duration: ms });
	sweep(image, color, ms, reveal.at);
	const sparks = RARITY[border ?? '']?.sparks ?? 0;
	if (sparks) sparkle(image, sparkColor, sparks, ms, reveal.at);
}