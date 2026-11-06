/**
 * Autres images d'une fiche (en plus de la couverture), au plus `MAX_GALLERY`, visibles seulement sur la fiche.
 * Rangées comme la couverture (`images/{id}`), dans `images/{id}_{n}` (n de 1 à 5, sans trou) : les règles Firestore ne
 * changent pas, et supprimer une fiche efface ses six emplacements sans rien déchiffrer, aucune image ne reste orpheline.
 * Firebase voit combien d'images a une fiche, rien de plus. AAD = "<id>_<n>/image". Leurs types MIME, dans l'ordre, sont
 * dans le `data` chiffré (`gallery`). Seule la couverture a une miniature, un cadrage et le recadrage.
 */
import type { Bytes } from '$lib/crypto/encoding';

export const MAX_IMAGES = 6;
export const MAX_GALLERY = MAX_IMAGES - 1;

/** Identifiant du document de l'image n (1 à `MAX_GALLERY`) : un id Firestore n'a jamais de « _ ». */
export const galleryImageId = (entryId: string, slot: number): string => `${entryId}_${slot}`;

/** Les emplacements possibles, pour tout supprimer ou tout relire. */
export const gallerySlots = (): number[] => Array.from({ length: MAX_GALLERY }, (_, i) => i + 1);

/** Image de la galerie à enregistrer ; `slot` : déjà enregistrée à cet emplacement, octets inchangés. */
export type GalleryItem = { type: string; image: Bytes; slot?: number };

export type GalleryPlan = {
	/** Emplacements à écrire (rechiffrés avec l'AAD de leur nouvel emplacement). */
	writes: { slot: number; item: GalleryItem }[];
	/** Emplacements à supprimer : ceux au-delà de la nouvelle galerie. */
	deletes: number[];
	/** Types MIME dans l'ordre, pour `data.gallery`. */
	types: string[];
};

/**
 * Écritures pour passer d'une galerie de `previousCount` images à `items`, dans cet ordre. Une image restée à son
 * emplacement n'est pas réécrite ; une image déplacée l'est (son AAD change).
 */
export function planGallery(items: GalleryItem[], previousCount: number): GalleryPlan {
	if (items.length > MAX_GALLERY) throw new Error(`${MAX_IMAGES} images au plus par fiche.`);
	const writes = items.map((item, i) => ({ slot: i + 1, item })).filter(({ slot, item }) => item.slot !== slot);
	const deletes = gallerySlots().filter((slot) => slot > items.length && slot <= previousCount);
	return { writes, deletes, types: items.map((item) => item.type) };
}
