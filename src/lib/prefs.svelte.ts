/**
 * Préférences d'affichage, propres à chaque appareil (localStorage) : rien de sensible, rien de synchronisé.
 * Le thème est aussi appliqué avant le premier rendu par `static/theme.js` (même clé).
 */
export type Theme = 'auto' | 'light' | 'dark';
export type CardSize = 'small' | 'medium' | 'large';
/** Minutes d'inactivité avant verrouillage ; 0 = jamais. */
export type AutoLock = 0 | 1 | 5 | 15 | 30;
/** Clic sur une carte compacte : la déplier (tags, liens) ou ouvrir la fiche. */
export type CardClick = 'expand' | 'open';
type Prefs = {
	theme: Theme;
	linksInNewTab: boolean;
	cardSize: CardSize;
	autoLockMinutes: AutoLock;
	/** Collection affichée : identifiant aléatoire, rien de lisible. Vide ou inconnue → la première. */
	collectionId: string;
	showHidden: boolean;
	/** Cartes détaillées : tags et liens affichés partout ; sinon compactes, une seule dépliée à la fois. */
	detailedCards: boolean;
	cardClick: CardClick;
};

const STORAGE_KEY = 'locket.prefs';
const DEFAULTS: Prefs = {
	theme: 'auto',
	linksInNewTab: true,
	cardSize: 'medium',
	autoLockMinutes: 5,
	collectionId: '',
	showHidden: false,
	detailedCards: false,
	cardClick: 'expand'
};

function load(): Prefs {
	try {
		const stored: Partial<Prefs> = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		// Seules les clés connues : un réglage retiré (ex. `cardLinksExpanded`) disparaît du stockage.
		const known = Object.keys(DEFAULTS).filter((key) => key in stored).map((key) => [key, stored[key as keyof Prefs]]);
		return { ...DEFAULTS, ...Object.fromEntries(known) };
	} catch {
		return { ...DEFAULTS };
	}
}

export const prefs = $state<Prefs>(load());

$effect.root(() => {
	$effect(() => {
		const root = document.documentElement;
		if (prefs.theme === 'auto') delete root.dataset.theme;
		else root.dataset.theme = prefs.theme;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
		} catch {
			// Stockage indisponible (navigation privée) : le réglage vaut pour la session.
		}
	});
});
