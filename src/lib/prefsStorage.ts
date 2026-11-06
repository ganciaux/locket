/**
 * Préférences d'affichage : types, valeurs par défaut et lecture du stockage (fonction pure, testée).
 * L'état réactif et l'écriture sont dans `prefs.svelte.ts`.
 */
import { type RevealMode, REVEAL_DEFAULT_MS, parseRevealMode, parseRevealMs } from './reveal';

export type Theme = 'auto' | 'light' | 'dark';
export type CardSize = 'small' | 'medium' | 'large';
/** Minutes d'inactivité avant verrouillage ; 0 = jamais. */
export type AutoLock = 0 | 1 | 5 | 15 | 30;
/** Dos des cartes face cachée de l'album (app.css, `.album-back`). */
/** Miniature de l'index en liste : aucune, petite (à côté du nom) ou grande (comme une petite carte). */
export type IndexThumb = 'off' | 'small' | 'large';
export const INDEX_THUMBS: { value: IndexThumb; label: string }[] = [
	{ value: 'off', label: 'aucune' },
	{ value: 'small', label: 'petite' },
	{ value: 'large', label: 'grande' }
];
export type AlbumBack = 'night' | 'ivory' | 'slate';
export const ALBUM_BACKS: { value: AlbumBack; label: string }[] = [
	{ value: 'night', label: 'Bordeaux nuit' },
	{ value: 'ivory', label: 'Papier ivoire' },
	{ value: 'slate', label: 'Ardoise et or' }
];
export type Prefs = {
	theme: Theme;
	linksInNewTab: boolean;
	cardSize: CardSize;
	autoLockMinutes: AutoLock;
	/** Collection affichée : identifiant aléatoire, rien de lisible. Vide ou inconnue → la première. */
	collectionId: string;
	showHidden: boolean;
	/** Cartes de la liste : tags et liens affichés sur toutes les cartes, chacun à part ; sinon cartes compactes. */
	cardTags: boolean;
	cardLinks: boolean;
	/** Index de la collection (`/list`) : en cartes (sélection visuelle) plutôt qu'en liste de noms. */
	indexCards: boolean;
	/** Index de la collection (`/list`) : lettres de séparation, puis informations affichées sous chaque nom. */
	indexInitials: boolean;
	indexThumb: IndexThumb;
	indexRank: boolean;
	indexCountry: boolean;
	indexAge: boolean;
	/** Coche des fiches validées, en bout de ligne. */
	indexStatus: boolean;
	indexTags: boolean;
	indexLinks: boolean;
	/** Tirage au hasard (dé) : façon de révéler la carte, et durée en millisecondes. */
	revealMode: RevealMode;
	/** Animation tirée au sort à chaque tirage (icône Remélanger), au lieu de `revealMode`. */
	revealRandom: boolean;
	revealMs: number;
	albumBack: AlbumBack;
};

export const STORAGE_KEY = 'locket.prefs';
export const DEFAULTS: Prefs = {
	theme: 'auto',
	linksInNewTab: true,
	cardSize: 'medium',
	autoLockMinutes: 5,
	collectionId: '',
	showHidden: false,
	cardTags: false,
	cardLinks: false,
	indexCards: false,
	indexInitials: true,
	indexThumb: 'off',
	indexRank: false,
	indexCountry: true,
	indexAge: false,
	indexStatus: true,
	indexTags: false,
	indexLinks: false,
	revealMode: 'pack',
	revealRandom: false,
	revealMs: REVEAL_DEFAULT_MS,
	albumBack: 'night'
};

/** Contenu stocké → préférences complètes. Illisible : valeurs par défaut. */
export function parsePrefs(text: string | null): Prefs {
	try {
		const stored: Record<string, unknown> = JSON.parse(text ?? '{}') ?? {};
		// Seules les clés connues : un réglage retiré (ex. `cardLinksExpanded`) disparaît du stockage.
		const known = Object.keys(DEFAULTS).filter((key) => key in stored).map((key) => [key, stored[key]]);
		const loaded: Prefs = { ...DEFAULTS, ...Object.fromEntries(known) };
		// Ancien `detailedCards` : tags et liens ensemble, devenus deux réglages.
		if (stored.detailedCards === true && !('cardTags' in stored) && !('cardLinks' in stored))
			Object.assign(loaded, { cardTags: true, cardLinks: true });
		return {
			...loaded,
			revealMode: parseRevealMode(loaded.revealMode),
			// Ancienne valeur « Aléatoire » du mode : devenue une option à part.
			revealRandom: loaded.revealRandom === true || stored.revealMode === 'random',
			revealMs: parseRevealMs(loaded.revealMs),
			// Ancienne case à cocher : cochée = petite miniature.
			indexThumb:
				stored.indexThumb === true
					? 'small'
					: (INDEX_THUMBS.find((thumb) => thumb.value === loaded.indexThumb)?.value ?? 'off'),
			albumBack: ALBUM_BACKS.find((back) => back.value === loaded.albumBack)?.value ?? 'night'
		};
	} catch {
		return { ...DEFAULTS };
	}
}
