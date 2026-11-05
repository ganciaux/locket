/** Texte : recherche sans casse ni accents, libellés, initiales, ordre par nom. */

/** Insensible à la casse et aux accents : « ecole » trouve « École ». */
export const searchKey = (text: string): string =>
	text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export const matchesSearch = (name: string, query: string): boolean =>
	searchKey(name).includes(searchKey(query));

/** Index : groupes par initiale sans accent, dans l'ordre reçu ; « # » pour un nom qui ne commence pas par une lettre. */
export function groupByInitial<T extends { name: string }>(items: T[]): { initial: string; items: T[] }[] {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const first = searchKey(item.name).charAt(0).toUpperCase();
		const initial = /\p{L}/u.test(first) ? first : '#';
		groups.set(initial, [...(groups.get(initial) ?? []), item]);
	}
	return [...groups].map(([initial, grouped]) => ({ initial, items: grouped }));
}

export const MAX_LABEL_LENGTH = 40;

/**
 * Nettoie le nom d'un tag ou d'une collection ; lève une erreur affichable s'il est vide
 * ou déjà pris parmi `existing` (sans casse ni accents).
 */
export function parseLabel(input: string, existing: { name: string }[]): string {
	const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL_LENGTH);
	if (!name) throw new Error('Le nom ne peut pas être vide.');
	if (existing.some((item) => searchKey(item.name) === searchKey(name))) throw new Error(`« ${name} » existe déjà.`);
	return name;
}

/** Déplace l'élément `index` d'un cran (`-1` vers le haut, `1` vers le bas) ; inchangé aux extrémités. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
	const target = index + delta;
	if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
	const next = [...list];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

export const byName = (a: { name: string }, b: { name: string }): number =>
	a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Noms de fiche

export const MAX_NAME_LENGTH = 200;

/** Remarques d'une fiche : de quoi écrire quelques paragraphes, loin de la limite d'un document Firestore. */
export const MAX_REMARKS_LENGTH = 2000;

/** Remarques nettoyées : bords et lignes vides en trop retirés, longueur bornée ; vide → `undefined`. */
export function parseRemarks(text: string | undefined): string | undefined {
	const cleaned = (text ?? '').trim().replace(/\n{3,}/g, '\n\n').slice(0, MAX_REMARKS_LENGTH).trim();
	return cleaned || undefined;
}
