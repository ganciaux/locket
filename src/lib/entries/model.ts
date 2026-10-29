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
	/** Identifiants du catalogue de tags ; un identifiant inconnu (tag supprimé) est ignoré. */
	tagIds?: string[];
};

export type Entry = EntryData & { id: string };

/** Tag libre : l'app ne connaît que son identifiant aléatoire et le libellé choisi par l'utilisateur. */
export type Tag = { id: string; name: string };

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

/**
 * Filtre par tags de la liste :
 *  - aucun tag sélectionné : pas de filtre ;
 *  - `or` : au moins un des tags sélectionnés ; `and` : tous ;
 *  - `untagged` : uniquement les fiches sans tag (exclusif des tags sélectionnés).
 */
export type TagFilter = { tagIds: string[]; mode: 'or' | 'and'; untagged: boolean };

export const NO_TAG_FILTER: TagFilter = { tagIds: [], mode: 'or', untagged: false };

/** Le texte doit apparaître dans le nom ou dans l'un des tags ; les tags supprimés (inconnus) sont ignorés. */
export function matchesFilter(
	entry: { name: string; tagIds?: string[] },
	query: string,
	filter: TagFilter,
	tagNames: Map<string, string>
): boolean {
	const known = (entry.tagIds ?? []).filter((id) => tagNames.has(id));
	if (filter.untagged) {
		if (known.length) return false;
	} else if (filter.tagIds.length) {
		const has = (id: string) => known.includes(id);
		if (filter.mode === 'and' ? !filter.tagIds.every(has) : !filter.tagIds.some(has)) return false;
	}
	return matchesSearch(entry.name, query) || known.some((id) => matchesSearch(tagNames.get(id)!, query));
}

export const MAX_TAG_LENGTH = 40;

/** Nettoie un libellé de tag ; lève une erreur affichable s'il est vide ou déjà pris. */
export function parseTagName(input: string, existing: Tag[]): string {
	const name = input.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
	if (!name) throw new Error('Le tag ne peut pas être vide.');
	if (existing.some((tag) => searchKey(tag.name) === searchKey(name)))
		throw new Error(`Le tag « ${name} » existe déjà.`);
	return name;
}

export const byName = (a: { name: string }, b: { name: string }): number =>
	a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

export type SortOrder = 'name' | 'created' | 'updated';
type Sortable = { name: string; createdAt: number; updatedAt: number };

/** Par nom (A→Z), ou du plus récent au plus ancien ; à date égale, par nom. */
export const sortBy =
	(order: SortOrder) =>
	(a: Sortable, b: Sortable): number => {
		if (order === 'created') return b.createdAt - a.createdAt || byName(a, b);
		if (order === 'updated') return b.updatedAt - a.updatedAt || byName(a, b);
		return byName(a, b);
	};

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
