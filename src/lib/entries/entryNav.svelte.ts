/**
 * D'où vient la fiche ouverte : la liste d'ids de la page d'origine (résultats filtrés et triés, classement) et son
 * adresse, pour les flèches précédente / suivante et le retour. Enregistré juste avant d'ouvrir une fiche ; en mémoire
 * seulement. Sans contexte, la fiche navigue dans sa collection par nom.
 */
import { onLock } from '$lib/auth/session.svelte';

/** `ids` à null après un verrouillage : seul le retour reste, pour la fiche `entryId` alors ouverte. */
type EntryNav = { ids: string[] | null; entryId: string | null; backHref: string; backLabel: string; scrollY: number };

let nav = $state.raw<EntryNav | null>(null);

/** À appeler depuis `beforeNavigate` de la page d'origine, quand elle ouvre une fiche. */
export function rememberEntryNav(ids: string[], backHref: string, backLabel: string): void {
	nav = { ids, entryId: null, backHref, backLabel, scrollY: window.scrollY };
}

/** Le contexte de la fiche `id`, si elle vient de la page d'origine ; sinon null. */
export function originOf(id: string): EntryNav | null {
	if (!nav) return null;
	return (nav.ids ? nav.ids.includes(id) : nav.entryId === id) ? nav : null;
}

/** Fiche voisine ouverte depuis la fiche : après un verrouillage, le retour la suit. */
export function followEntryNav(from: string, to: string): void {
	if (nav && !nav.ids && nav.entryId === from) nav = { ...nav, entryId: to };
}

/** Au retour d'une fiche, depuis `afterNavigate` : on retrouve la place dans une longue liste. */
export function restoreEntryNavScroll(backHref: string): void {
	if (nav?.backHref === backHref) window.scrollTo(0, nav.scrollY);
}

// La liste d'ids découle des fiches déchiffrées : effacée. Le retour (page et libellé fixes) reste pour la fiche
// ouverte, dont l'id est déjà dans l'adresse : le déverrouillage ne change pas le lien. Un autre compte n'a pas
// les mêmes ids, ce contexte ne s'y applique jamais.
onLock(() => {
	const id = location.pathname.match(/^\/entry\/([^/]+)/)?.[1];
	const origin = id ? originOf(id) : null;
	nav = origin && id ? { ...origin, ids: null, entryId: id } : null;
});
