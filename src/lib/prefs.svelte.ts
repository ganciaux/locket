/**
 * Préférences d'affichage, propres à chaque appareil (localStorage) : rien de sensible, rien de synchronisé.
 * Le thème est aussi appliqué avant le premier rendu par le script inline de `app.html` (même clé).
 */
export type Theme = 'auto' | 'light' | 'dark';
export type CardSize = 'small' | 'medium' | 'large';
type Prefs = { theme: Theme; linksInNewTab: boolean; cardSize: CardSize };

const STORAGE_KEY = 'locket.prefs';
const DEFAULTS: Prefs = { theme: 'auto', linksInNewTab: true, cardSize: 'medium' };

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
