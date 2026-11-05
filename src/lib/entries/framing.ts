/**
 * Cadrage de la carte : quelle partie d'une image non carrée la carte carrée montre (`object-cover`).
 * Un seul nombre de 0 à 100 sert pour les deux axes : une image en hauteur ne dépasse qu'en hauteur, une image en
 * largeur qu'en largeur ; l'autre axe n'a donc aucun effet. Rendu par des classes fixes : la CSP interdit le style en ligne.
 */

export const FRAMING_STEP = 5;
export const FRAMING_CENTER = 50;

// Classes écrites en entier pour que Tailwind les génère (il ne voit pas les noms construits).
const FRAMING_CLASSES = [
	'object-[0%_0%]',
	'object-[5%_5%]',
	'object-[10%_10%]',
	'object-[15%_15%]',
	'object-[20%_20%]',
	'object-[25%_25%]',
	'object-[30%_30%]',
	'object-[35%_35%]',
	'object-[40%_40%]',
	'object-[45%_45%]',
	'object-[50%_50%]',
	'object-[55%_55%]',
	'object-[60%_60%]',
	'object-[65%_65%]',
	'object-[70%_70%]',
	'object-[75%_75%]',
	'object-[80%_80%]',
	'object-[85%_85%]',
	'object-[90%_90%]',
	'object-[95%_95%]',
	'object-[100%_100%]'
];

/** Valeur à enregistrer : multiple de `FRAMING_STEP` entre 0 et 100 ; le centre (par défaut) ou une valeur invalide → undefined. */
export function parseFraming(value: unknown): number | undefined {
	if (!Number.isInteger(value)) return undefined;
	const framing = value as number;
	const valid = framing >= 0 && framing <= 100 && framing % FRAMING_STEP === 0;
	return valid && framing !== FRAMING_CENTER ? framing : undefined;
}

/** Classe `object-position` d'une miniature ; centrée sans cadrage. */
export const framingClass = (framing: number | undefined): string =>
	FRAMING_CLASSES[(parseFraming(framing) ?? FRAMING_CENTER) / FRAMING_STEP];
