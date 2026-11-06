/**
 * Tirage au hasard (dé) : la carte se révèle, puis un reflet de la couleur de sa bordure (or, argent…) ou blanc la
 * balaie. Huit façons de la révéler, au choix dans Paramètres (ou tirée au sort), avec leur durée. Plus la carte est
 * rare (bordure bronze, argent, or), plus la révélation dure et plus elle jette de paillettes.
 * Animations Web (pas de style en ligne : CSP) ; un simple fondu si le système demande moins d'animations.
 */

export type RevealMode = 'pack' | 'flip' | 'glow' | 'scratch' | 'polaroid' | 'drop' | 'spin' | 'curtain';

export const REVEAL_MODES: { value: RevealMode; label: string; hint: string }[] = [
	{ value: 'pack', label: 'Paquet', hint: 'Floue et sombre, la carte tremble puis se dévoile d’un éclat.' },
	{ value: 'flip', label: 'Retournement', hint: 'La carte arrive de dos et se retourne.' },
	{ value: 'glow', label: 'Éclat', hint: 'La carte surgit d’une lumière blanche.' },
	{ value: 'scratch', label: 'Grattage', hint: 'Un voile gris s’efface d’un geste, comme un ticket à gratter.' },
	{ value: 'polaroid', label: 'Polaroïd', hint: 'La carte se développe : blanche, puis sépia, puis en couleurs.' },
	{ value: 'drop', label: 'Chute', hint: 'La carte tombe, rebondit et se pose.' },
	{ value: 'spin', label: 'Tourbillon', hint: 'La carte arrive en tournant, comme distribuée par un croupier.' },
	{ value: 'curtain', label: 'Rideau', hint: 'Un rideau de scène s’ouvre sur la carte.' }
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

/**
 * Mouvement de la carte, et moment (de 0 à 1) de son temps fort : le reflet et les paillettes s'y calent. Le flou et
 * l'assombrissement ne sont pas ici : la même courbe (`unveil`) pour toutes, sauf `light` (Éclat, Polaroïd) qui
 * ont leur propre lumière. `cover` : voile posé sur l'image (Grattage, Rideau). Courbes par segment quand `easing`
 * est linéaire.
 */
type Reveal = {
	frames: Keyframe[];
	easing: string;
	at: number;
	light?: true;
	cover?: (image: HTMLElement, duration: number) => void;
};

// Carte encore cachée : assez floue et terne pour ne pas la reconnaître ; nette un peu avant la fin, pour le reflet.
const HIDDEN = 'blur(22px) saturate(0.1) brightness(0.55)';
const SHARP = 'blur(0px) saturate(1) brightness(1)';
const UNVEILED_AT = 0.9;

/** De cachée à nette, progressivement, du début à la fin de l'animation. */
const unveil = (from: Keyframe, to: Keyframe): Keyframe[] => [
	{ offset: 0, ...from, easing: 'ease-in-out' },
	{ offset: UNVEILED_AT, ...to },
	{ offset: 1, ...to }
];

const REVEALS: Record<RevealMode, Reveal> = {
	// La carte tremble, puis se dévoile d'un éclat.
	pack: {
		easing: 'ease-in-out',
		at: 0.58,
		frames: [
			{ offset: 0, transform: 'scale(0.92) rotate(0deg)' },
			{ offset: 0.12, transform: 'scale(0.93) rotate(-4deg)' },
			{ offset: 0.22, transform: 'scale(0.94) rotate(4deg)' },
			{ offset: 0.32, transform: 'scale(0.94) rotate(-3deg)' },
			{ offset: 0.42, transform: 'scale(0.95) rotate(3deg)' },
			{ offset: 0.52, transform: 'scale(0.95) rotate(-1.5deg)' },
			{ offset: 0.58, transform: 'scale(0.95) rotate(0deg)' },
			{ offset: 0.72, transform: 'scale(1.05) rotate(0deg)' },
			{ offset: 1, transform: 'scale(1) rotate(0deg)' }
		]
	},
	// De dos, la carte pivote jusqu'à la tranche, puis montre sa face en finissant de tourner.
	flip: {
		easing: 'ease-in-out',
		at: 0.45,
		frames: [
			{ offset: 0, transform: 'perspective(900px) rotateY(0deg) scale(0.94)' },
			{ offset: 0.15, transform: 'perspective(900px) rotateY(-12deg) scale(0.94)' },
			{ offset: 0.45, transform: 'perspective(900px) rotateY(90deg) scale(0.97)' },
			{ offset: 0.4501, transform: 'perspective(900px) rotateY(-90deg) scale(0.97)' },
			{ offset: 0.8, transform: 'perspective(900px) rotateY(0deg) scale(1.04)' },
			{ offset: 1, transform: 'perspective(900px) rotateY(0deg) scale(1)' }
		]
	},
	// Petite et surexposée, la carte grandit en perdant sa lumière.
	glow: {
		easing: 'linear',
		at: 0.35,
		light: true,
		frames: [
			{ offset: 0, transform: 'scale(0.6)', filter: 'blur(10px) brightness(3) saturate(0)', opacity: 0, easing: 'ease-out' },
			{ offset: 0.2, transform: 'scale(0.8)', filter: 'blur(6px) brightness(2.6) saturate(0.3)', opacity: 1, easing: 'ease-in' },
			{ offset: 0.35, transform: 'scale(1.08)', filter: 'blur(0px) brightness(1.8) saturate(1)', opacity: 1, easing: 'ease-out' },
			{ offset: 1, transform: 'scale(1)', filter: 'blur(0px) brightness(1) saturate(1)', opacity: 1 }
		]
	},
	// Sous un voile gris gratté d'un geste continu (voir `scratchCover`) ; la carte ressort d'un petit coup à la fin.
	scratch: {
		easing: 'linear',
		at: 0.85,
		cover: (image, duration) => scratchCover(image, duration),
		frames: [
			{ offset: 0, transform: 'scale(1)' },
			{ offset: 0.85, transform: 'scale(1)', easing: 'ease-out' },
			{ offset: 0.92, transform: 'scale(1.04)', easing: 'ease-in-out' },
			{ offset: 1, transform: 'scale(1)' }
		]
	},
	// Une photo instantanée qui se développe : blanche et pâle, puis sépia, puis ses vraies couleurs.
	polaroid: {
		easing: 'linear',
		at: 0.75,
		light: true,
		frames: [
			{ offset: 0, filter: 'blur(3px) brightness(2.4) contrast(0.35) saturate(0) sepia(0)', easing: 'ease-in' },
			{ offset: 0.4, filter: 'blur(1px) brightness(1.5) contrast(0.6) saturate(0.6) sepia(0.9)', easing: 'ease-in-out' },
			{ offset: 0.75, filter: 'blur(0px) brightness(1.08) contrast(0.95) saturate(1) sepia(0.25)', easing: 'ease-out' },
			{ offset: 1, filter: 'blur(0px) brightness(1) contrast(1) saturate(1) sepia(0)' }
		]
	},
	// Tombe, rebondit deux fois en s'écrasant un peu.
	drop: {
		easing: 'linear',
		at: 0.45,
		frames: [
			{ offset: 0, transform: 'translateY(-130%) scale(1, 1)', opacity: 0, easing: 'ease-in' },
			{ offset: 0.12, transform: 'translateY(-100%) scale(1, 1)', opacity: 1, easing: 'ease-in' },
			{ offset: 0.45, transform: 'translateY(0) scale(1.06, 0.92)', opacity: 1, easing: 'ease-out' },
			{ offset: 0.6, transform: 'translateY(-14%) scale(0.98, 1.03)', opacity: 1, easing: 'ease-in' },
			{ offset: 0.74, transform: 'translateY(0) scale(1.03, 0.96)', opacity: 1, easing: 'ease-out' },
			{ offset: 0.84, transform: 'translateY(-4%) scale(1, 1)', opacity: 1, easing: 'ease-in' },
			{ offset: 0.93, transform: 'translateY(0) scale(1.01, 0.99)', opacity: 1, easing: 'ease-out' },
			{ offset: 1, transform: 'translateY(0) scale(1, 1)', opacity: 1 }
		]
	},
	// Toute petite, la carte tourne sur elle-même en grandissant, puis se pose.
	spin: {
		easing: 'linear',
		at: 0.62,
		frames: [
			{ offset: 0, transform: 'rotate(-720deg) scale(0.15)', opacity: 0, easing: 'ease-out' },
			{ offset: 0.15, transform: 'rotate(-480deg) scale(0.4)', opacity: 1, easing: 'ease-out' },
			{ offset: 0.62, transform: 'rotate(0deg) scale(1.06)', opacity: 1, easing: 'ease-in-out' },
			{ offset: 1, transform: 'rotate(0deg) scale(1)', opacity: 1 }
		]
	},
	// Deux pans de rideau (voir `curtainCover`) ; la carte avance d'un rien quand ils s'ouvrent.
	curtain: {
		easing: 'linear',
		at: 0.6,
		cover: (image, duration) => curtainCover(image, duration),
		frames: [
			{ offset: 0, transform: 'scale(0.97)' },
			{ offset: 0.3, transform: 'scale(0.97)', easing: 'ease-out' },
			{ offset: 0.75, transform: 'scale(1.03)', easing: 'ease-in-out' },
			{ offset: 1, transform: 'scale(1)' }
		]
	}
};

// Nom de la carte : suit la même courbe que l'image, ou se pose au temps fort pour Éclat et Polaroïd.
const BLURRED_TITLE = { filter: 'blur(6px)', opacity: 0.4 };
const SHARP_TITLE = { filter: 'blur(0px)', opacity: 1 };
const titleFrames = (reveal: Reveal): Keyframe[] =>
	reveal.light
		? [
				{ offset: 0, ...BLURRED_TITLE },
				{ offset: reveal.at, ...BLURRED_TITLE, easing: 'ease-out' },
				{ offset: Math.min(reveal.at + 0.17, 1), ...SHARP_TITLE },
				{ offset: 1, ...SHARP_TITLE }
			]
		: unveil(BLURRED_TITLE, SHARP_TITLE);

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

/** Élément posé exactement sur l'image (ou sur une bande : `from` et `width` en fraction de sa largeur). */
function covering(image: HTMLElement, className: string, color = '', from = 0, width = 1): HTMLSpanElement | null {
	const element = overlay(image, className, color);
	if (!element) return null;
	element.style.left = `${image.offsetLeft + image.offsetWidth * from}px`;
	element.style.top = `${image.offsetTop}px`;
	element.style.width = `${image.offsetWidth * width}px`;
	element.style.height = `${image.offsetHeight}px`;
	return element;
}

/** Grattage : un voile gris effacé de gauche à droite d'un seul geste continu. */
function scratchCover(image: HTMLElement, duration: number): void {
	const veil = covering(image, 'reveal-veil');
	if (!veil) return;
	veil
		.animate(
			[
				{ offset: 0, clipPath: 'inset(0 0 0 0%)' },
				{ offset: 0.08, clipPath: 'inset(0 0 0 0%)', easing: 'ease-in-out' },
				{ offset: 0.85, clipPath: 'inset(0 0 0 101%)' },
				{ offset: 1, clipPath: 'inset(0 0 0 101%)' }
			],
			{ duration }
		)
		.finished.finally(() => veil.remove());
}

/** Rideau : deux pans fermés, puis repliés chacun vers son bord. */
function curtainCover(image: HTMLElement, duration: number): void {
	for (const side of ['left', 'right'] as const) {
		const panel = covering(image, `reveal-curtain reveal-curtain-${side}`, '', side === 'left' ? 0 : 0.5, 0.5);
		if (!panel) return;
		panel.style.transformOrigin = side;
		panel
			.animate(
				[
					{ offset: 0, transform: 'scaleX(1)' },
					{ offset: 0.25, transform: 'scaleX(1)', easing: 'cubic-bezier(0.6, 0, 0.3, 1)' },
					{ offset: 0.62, transform: 'scaleX(0.04)' },
					{ offset: 1, transform: 'scaleX(0.04)', opacity: 0 }
				],
				{ duration }
			)
			.finished.finally(() => panel.remove());
	}
}

/** Reflet qui balaie l'image à partir du moment `at`. */
function sweep(image: HTMLElement, color: string, duration: number, at: number): void {
	const sheen = covering(image, 'reveal-sheen', color);
	if (!sheen) return;
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
	// Flou et assombrissement à part du mouvement : les deux animations se cumulent (propriétés différentes).
	if (!reveal.light) image.animate(unveil({ filter: HIDDEN }, { filter: SHARP }), { duration: ms });
	reveal.cover?.(image, ms);
	title?.animate(titleFrames(reveal), { duration: ms });
	sweep(image, color, ms, reveal.at);
	const sparks = RARITY[border ?? '']?.sparks ?? 0;
	if (sparks) sparkle(image, sparkColor, sparks, ms, reveal.at);
}