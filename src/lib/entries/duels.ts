/** Classement par duels : insertion par dichotomie, rang calculé à l'affichage. */

// ---------------------------------------------------------------------------
// Classement : la fiche à classer affronte celle du milieu de la plage encore possible (dichotomie),
// soit environ log2(n) duels par fiche.

/** Seules les fiches avec image se classent : un duel oppose deux images. */
export const isRankable = (entry: { imageType?: string }): boolean => !!entry.imageType;

/**
 * Classement effectif : l'ordre enregistré, réduit à `items` (fiches vivantes de la collection) qui ont une image.
 * Une fiche mise à la corbeille, déplacée ou sans image en sort sans rien réécrire : les suivantes remontent
 * d'un rang, et elle retrouve sa place si elle revient.
 */
export function rankedIds(ranking: string[] | undefined, items: { id: string; imageType?: string }[]): string[] {
	const rankable = new Set(items.filter(isRankable).map((item) => item.id));
	return (ranking ?? []).filter((id) => rankable.has(id));
}

/** Place encore possible, entre les indices `lo` et `hi` du classement effectif (bornes comprises). */
export type Insertion = { lo: number; hi: number };

export const startInsertion = (count: number): Insertion => ({ lo: 0, hi: count });
export const insertionDone = ({ lo, hi }: Insertion): boolean => lo >= hi;
/** Indice de l'adversaire : le milieu de la plage. */
export const opponentIndex = ({ lo, hi }: Insertion): number => (lo + hi) >> 1;
/** Duels restants au plus. */
export const duelsLeft = ({ lo, hi }: Insertion): number => Math.ceil(Math.log2(hi - lo + 1));

export function chooseInsertion(insertion: Insertion, candidateWins: boolean): Insertion {
	const mid = opponentIndex(insertion);
	return candidateWins ? { lo: insertion.lo, hi: mid } : { lo: mid + 1, hi: insertion.hi };
}

/**
 * Classement enregistré avec `id` au rang `index` de `ranked` (classement effectif, sans `id`). Les fiches hors du
 * classement effectif (corbeille…) gardent leur place ; celles qui n'existent plus (absentes de `known`) sont retirées.
 */
export function withRanked(
	ranking: string[] | undefined,
	ranked: string[],
	id: string,
	index: number,
	known: Set<string>
): string[] {
	const rest = (ranking ?? []).filter((other) => other !== id && known.has(other));
	const at =
		index < ranked.length ? rest.indexOf(ranked[index]) : index > 0 ? rest.indexOf(ranked[index - 1]) + 1 : 0;
	return [...rest.slice(0, at), id, ...rest.slice(at)];
}
