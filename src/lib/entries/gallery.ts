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

/**
 * Vignettes des autres images (~200 px), toutes dans un seul document `images/{id}_t` (AAD "<id>_t/image") : la fiche
 * agrandie et la bande de la fiche les lisent en une fois (~50 Ko), l'image complète n'est chargée qu'au clic.
 */
export const galleryThumbsId = (entryId: string): string => `${entryId}_t`;

/** Vignette : son propre type (réencodée sur l'appareil, pas forcément au format de l'image). */
export type MiniThumb = { type: string; bytes: Bytes };

/** Image de la galerie à enregistrer ; `slot` : déjà enregistrée à cet emplacement, octets inchangés. */
export type GalleryItem = { type: string; image: Bytes; thumb: MiniThumb; slot?: number };

/** Vignettes en un seul bloc : longueur de l'en-tête (4 octets), en-tête JSON (types, longueurs), puis les octets. */
export function packThumbs(thumbs: MiniThumb[]): Bytes {
	const header = new TextEncoder().encode(JSON.stringify(thumbs.map(({ type, bytes }) => [type, bytes.length])));
	const packed = new Uint8Array(4 + header.length + thumbs.reduce((total, { bytes }) => total + bytes.length, 0));
	new DataView(packed.buffer).setUint32(0, header.length);
	packed.set(header, 4);
	let offset = 4 + header.length;
	for (const { bytes } of thumbs) {
		packed.set(bytes, offset);
		offset += bytes.length;
	}
	return packed;
}

/** Inverse de `packThumbs` ; un bloc incohérent lève une erreur (il a pourtant passé l'AES-GCM : ne devrait pas arriver). */
export function unpackThumbs(packed: Bytes): MiniThumb[] {
	const invalid = () => new Error('Vignettes illisibles.');
	if (packed.length < 4) throw invalid();
	const headerLength = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(0);
	if (4 + headerLength > packed.length) throw invalid();
	let header: unknown;
	try {
		header = JSON.parse(new TextDecoder().decode(packed.subarray(4, 4 + headerLength)));
	} catch {
		throw invalid();
	}
	if (!Array.isArray(header) || header.length > MAX_GALLERY) throw invalid();
	let offset = 4 + headerLength;
	const thumbs = header.map((item: unknown) => {
		if (!Array.isArray(item) || typeof item[0] !== 'string' || !Number.isInteger(item[1]) || item[1] < 0) throw invalid();
		const bytes = packed.slice(offset, offset + item[1]);
		if (bytes.length !== item[1]) throw invalid();
		offset += item[1];
		return { type: item[0], bytes };
	});
	if (offset !== packed.length) throw invalid();
	return thumbs;
}

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
