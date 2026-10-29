/**
 * Préférences d'affichage, propres à chaque appareil (localStorage) : rien de sensible, rien de synchronisé.
 * Le thème est aussi appliqué avant le premier rendu par `static/theme.js` (même clé).
 */
export type Theme = 'auto' | 'light' | 'dark';
export type CardSize = 'small' | 'medium' | 'large';
/** Minutes d'inactivité avant verrouillage ; 0 = jamais. */
export type AutoLock = 0 | 1 | 5 | 15 | 30;
type Prefs = { theme: Theme; linksInNewTab: boolean; cardSize: CardSize; autoLockMinutes: AutoLock };

const STORAGE_KEY = 'locket.prefs';
const DEFAULTS: Prefs = { theme: 'auto', linksInNewTab: true, cardSize: 'medium', autoLockMinutes: 5 };

function load(): Prefs {
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
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
