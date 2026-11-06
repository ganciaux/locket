/**
 * Préférences d'affichage, propres à chaque appareil (localStorage) : rien de sensible, rien de synchronisé.
 * Le thème est aussi appliqué avant le premier rendu par `static/theme.js` (même clé).
 */
import { type Prefs, STORAGE_KEY, parsePrefs } from './prefsStorage';

export { ALBUM_BACKS, type AlbumBack, type AutoLock, type CardSize, type Theme } from './prefsStorage';

function load(): Prefs {
	try {
		return parsePrefs(localStorage.getItem(STORAGE_KEY));
	} catch {
		return parsePrefs(null); // stockage indisponible (navigation privée)
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
