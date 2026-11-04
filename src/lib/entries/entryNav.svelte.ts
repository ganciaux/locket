/**
 * D'où vient la fiche ouverte : la liste d'ids de la page d'origine (résultats filtrés et triés, classement) et son
 * adresse, pour les flèches précédente / suivante et le retour. Enregistré juste avant d'ouvrir une fiche ; en mémoire
 * seulement, vidé au verrouillage. Sans contexte, la fiche navigue dans sa collection par nom.
 */
import { onLock } from '$lib/auth/session.svelte';

type EntryNav = { ids: string[]; backHref: string; backLabel: string; scrollY: number };

let nav = $state.raw<EntryNav | null>(null);

export const entryNav = {
	get current() {
		return nav;
	}
};

/** À appeler depuis `beforeNavigate` de la page d'origine, quand elle ouvre une fiche. */
export function rememberEntryNav(ids: string[], backHref: string, backLabel: string): void {
	nav = { ids, backHref, backLabel, scrollY: window.scrollY };
}

/** Au retour d'une fiche, depuis `afterNavigate` : on retrouve la place dans une longue liste. */
export function restoreEntryNavScroll(backHref: string): void {
	if (nav?.backHref === backHref) window.scrollTo(0, nav.scrollY);
}

onLock(() => (nav = null));
