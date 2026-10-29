// Thème choisi appliqué avant l'affichage (évite un flash clair). Voir src/lib/prefs.svelte.ts.
// Fichier externe plutôt que script inline : la CSP n'autorise que les scripts du site et ceux de SvelteKit.
try {
	var theme = JSON.parse(localStorage.getItem('locket.prefs') || '{}').theme;
	if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {}
