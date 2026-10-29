/** Modèle d'une fiche et règles pures (sans Firebase ni DOM), testées dans model.test.ts. */

export type Link = { url: string; label?: string };

/** Contenu du champ chiffré `data` (JSON). */
export type EntryData = {
	name: string;
	links: Link[];
	createdAt: number;
	updatedAt: number;
	/** Type MIME de l'image et de la miniature, absent si la fiche n'a pas d'image. */
	imageType?: string;
};

export type Entry = EntryData & { id: string };

/**
 * Normalise une URL saisie et refuse tout ce qui n'est pas http(s).
 * Un lien `javascript:` exécuterait du code dans l'app au clic, avec la DEK en mémoire.
 */
export function parseLinkUrl(input: string): string | null {
	const text = input.trim();
	if (!text) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
	try {
		const url = new URL(withScheme);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

/** Texte court d'un lien : son libellé, sinon le nom de domaine (sans « www. »). */
export function linkTitle(link: Link): string {
	if (link.label) return link.label;
	try {
		return new URL(link.url).hostname.replace(/^www\./, '');
	} catch {
		return link.url;
	}
}

/** Insensible à la casse et aux accents : « ecole » trouve « École ». */
export const searchKey = (text: string): string =>
	text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export const matchesSearch = (name: string, query: string): boolean =>
	searchKey(name).includes(searchKey(query));

export const byName = (a: { name: string }, b: { name: string }): number =>
	a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Import d'une liste de noms

export const MAX_NAME_LENGTH = 200;

/**
 * Un nom par ligne. Ignore les lignes vides et les doublons (casse et accents ignorés),
 * qu'ils soient déjà dans les fiches existantes ou répétés dans la liste.
 */
export function parseNameList(text: string, existingNames: string[]): { names: string[]; duplicates: number } {
	const seen = new Set(existingNames.map(searchKey));
	const names: string[] = [];
	let duplicates = 0;
	for (const line of text.split(/\r?\n/)) {
		const name = line.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
		if (!name) continue;
		const key = searchKey(name);
		if (seen.has(key)) {
			duplicates++;
			continue;
		}
		seen.add(key);
		names.push(name);
	}
	return { names, duplicates };
}

// ---------------------------------------------------------------------------
// Taille : un document Firestore est limité à 1 Mio ; on vise 900 Ko chiffré.

export const MAX_DOC_BYTES = 900 * 1024;
/** Tag AES-GCM + IV + noms de champs et métadonnées du document. */
const DOC_OVERHEAD_BYTES = 1024;

export const fitsInDoc = (...payloads: Uint8Array[]): boolean =>
	payloads.reduce((total, p) => total + p.length, DOC_OVERHEAD_BYTES) <= MAX_DOC_BYTES;

/** Dimensions réduites pour tenir dans un carré de `max` px, sans agrandir. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
	const scale = Math.min(1, max / Math.max(width, height));
	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Essais successifs : la qualité baisse d'abord, puis la taille si ça ne suffit pas. */
export const ENCODE_ATTEMPTS: { quality: number; scale: number }[] = [
	{ quality: 0.85, scale: 1 },
	{ quality: 0.75, scale: 1 },
	{ quality: 0.6, scale: 1 },
	{ quality: 0.6, scale: 0.75 },
	{ quality: 0.5, scale: 0.5 },
	{ quality: 0.4, scale: 0.35 }
];

/** Premier encodage qui tient dans un document ; `encode` est injecté (canvas en vrai, faux en test). */
export async function encodeUnderLimit<T extends Uint8Array>(
	encode: (quality: number, scale: number) => Promise<T>
): Promise<T> {
	for (const { quality, scale } of ENCODE_ATTEMPTS) {
		const bytes = await encode(quality, scale);
		if (fitsInDoc(bytes)) return bytes;
	}
	throw new Error('Image trop volumineuse, même compressée.');
}
