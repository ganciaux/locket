/**
 * Annulation de la dernière action groupée : calcul pur de la modification qui ramène une fiche à son état d'avant.
 * L'état lui-même (fiches avant et après) vit dans le store, en mémoire seulement.
 */

/** Champs de l'affichage, jamais écrits dans `data` (voir `patchStoredEntries`). */
const LOCAL_FIELDS = new Set(['id', 'thumb', 'thumbUrl']);

/**
 * Chaque champ présent avant ou maintenant reprend sa valeur d'avant ; un champ ajouté par l'action repasse à
 * undefined (absent du JSON chiffré).
 */
export function revertTo<T extends object>(current: T, before: T): Partial<T> {
	const keys = new Set([...Object.keys(current), ...Object.keys(before)].filter((key) => !LOCAL_FIELDS.has(key)));
	return Object.fromEntries([...keys].map((key) => [key, before[key as keyof T]])) as Partial<T>;
}
