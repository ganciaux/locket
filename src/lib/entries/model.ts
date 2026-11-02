/** Modèle d'une fiche et règles pures (sans Firebase ni DOM), testées dans model.test.ts. */

/** `hidden` : conservé sur la fiche, mais pas affiché. */
export type Link = { url: string; label?: string; hidden?: boolean };

/** Contenu du champ chiffré `data` (JSON). */
export type EntryData = {
	/** Une fiche appartient toujours à une seule collection. */
	collectionId: string;
	name: string;
	links: Link[];
	createdAt: number;
	updatedAt: number;
	/** Type MIME de l'image et de la miniature, absent si la fiche n'a pas d'image. */
	imageType?: string;
	/** Tags de sa collection ; un identifiant inconnu (tag supprimé) est ignoré. */
	tagIds?: string[];
	/** Par site de la collection : terme à chercher s'il diffère du nom de la fiche. */
	siteTerms?: Record<string, string>;
	/** Sites de la collection qui ne donnent pas de lien sur cette fiche. */
	hiddenSites?: string[];
	/** Sites « sur demande » de la collection activés sur cette fiche. */
	shownSites?: string[];
	/** Rangée à l'écart : absente de la liste sauf avec le bouton « Cachées ». Simple filtre, pas une protection. */
	hidden?: boolean;
	/** Note de 1 à `MAX_RATING` : 5 étoiles par demi-étoile ; absente, la fiche n'est pas notée. */
	rating?: number;
	/** Pays : code ISO 3166-1 alpha-2 (`FR`, `GB`…), un seul par fiche. */
	country?: string;
	/** Dans la corbeille depuis cette date ; supprimée pour de bon après `TRASH_DAYS` jours. */
	deletedAt?: number;
};

export type Entry = EntryData & { id: string };

export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Jours restants avant la suppression définitive (au moins 0). */
export const trashDaysLeft = (deletedAt: number, now: number): number =>
	Math.max(0, Math.ceil(TRASH_DAYS - (now - deletedAt) / DAY_MS));

export const isTrashExpired = (deletedAt: number | undefined, now: number): boolean =>
	deletedAt !== undefined && now - deletedAt >= TRASH_DAYS * DAY_MS;

/** Regroupement exclusif des fiches (Manga, Chanteurs…) ; l'ordre du catalogue est l'ordre d'affichage. */
export type Collection = {
	id: string;
	name: string;
	sites?: Site[];
	/** Classement par duels : ids de la meilleure fiche à la moins bonne ; une fiche absente n'est pas classée. */
	ranking?: string[];
	/** Nouveau classement en cours : reçoit les duels, puis remplace `ranking` une fois terminé. */
	rankingDraft?: string[];
};

/** Site d'une collection : ses liens sont calculés à l'affichage, le modèle se corrige donc en un seul endroit. */
export type Site = {
	id: string;
	label: string;
	urlTemplate: string;
	enabled: boolean;
	/** Sur demande : le lien n'apparaît que sur les fiches qui l'activent (terme propre souvent nécessaire). */
	optIn?: boolean;
};

/** Mode d'un site dans l'administration : inutilisé, sur toutes les fiches, ou seulement celles qui l'activent. */
export type SiteMode = 'off' | 'all' | 'optIn';

export const siteMode = (site: Site): SiteMode => (!site.enabled ? 'off' : site.optIn ? 'optIn' : 'all');

export const withSiteMode = (site: Site, mode: SiteMode): Site => ({
	...site,
	enabled: mode !== 'off',
	optIn: mode === 'off' ? site.optIn : mode === 'optIn' || undefined
});

type SiteChoices = Pick<EntryData, 'hiddenSites' | 'shownSites'>;

/** Lien du site affiché sur la fiche : site utilisé, puis non masqué (toutes les fiches) ou activé (sur demande). */
export const siteShown = (entry: SiteChoices, site: Site): boolean =>
	site.enabled && (site.optIn ? !!entry.shownSites?.includes(site.id) : !entry.hiddenSites?.includes(site.id));

/**
 * Affiche ou masque des sites sur une fiche : `visible` renvoie true, false, ou undefined pour ne pas y toucher.
 * Un site pour toutes les fiches passe par `hiddenSites`, un site sur demande par `shownSites` ; les deux listes
 * sont gardées, pour retrouver les choix de la fiche si le mode du site change.
 */
export function withSiteVisibility(entry: SiteChoices, sites: Site[], visible: (siteId: string) => boolean | undefined): SiteChoices {
	const hidden = new Set(entry.hiddenSites ?? []);
	const shown = new Set(entry.shownSites ?? []);
	for (const site of sites) {
		const show = visible(site.id);
		if (show === undefined) continue;
		const [set, add] = site.optIn ? [shown, show] : [hidden, !show];
		if (add) set.add(site.id);
		else set.delete(site.id);
	}
	return { hiddenSites: hidden.size ? [...hidden] : undefined, shownSites: shown.size ? [...shown] : undefined };
}

/**
 * Une fiche dont la collection est inconnue (catalogue perdu ou altéré) deviendrait invisible : sa collection
 * est recréée avec un nom provisoire, à renommer. Elle n'est écrite qu'à la prochaine modification du catalogue.
 */
export function withRecoveredCollections(collections: Collection[], entries: { collectionId: string }[]): Collection[] {
	const known = new Set(collections.map((c) => c.id));
	const missing = [...new Set(entries.map((entry) => entry.collectionId))].filter((id) => !known.has(id));
	return [...collections, ...missing.map((id, i) => ({ id, name: `Collection récupérée ${i + 1}` }))];
}

/** Tag libre, propre à une collection : l'app ne connaît que son identifiant aléatoire et son libellé. */
export type Tag = { id: string; name: string; collectionId: string };

/**
 * Normalise une URL saisie et refuse tout ce qui n'est pas http(s).
 * Un lien `javascript:` exécuterait du code dans l'app au clic, avec la DEK en mémoire.
 */
export function parseLinkUrl(input: string): string | null {
	const text = withScheme(input.trim());
	if (!text) return null;
	try {
		const url = new URL(text);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

const withScheme = (text: string): string => (!text || /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);

export const NAME_PLACEHOLDER = '{{name}}';
/** Variante de {{name}} sans aucun espace : « my name » donne « myname ». */
export const NOSPACE_PLACEHOLDER = '{{nospace}}';
const PLACEHOLDER = /\{\{(name|nospace)\}\}/g;

const fill = (template: string, value: (placeholder: string) => string): string =>
	template.replace(PLACEHOLDER, (_, placeholder: string) => value(placeholder));

/** Le terme est encodé (`%20` vaut partout, `+` seulement dans une querystring) : il ne peut pas sortir de sa place. */
const fillTemplate = (template: string, term: string): string =>
	fill(template, (placeholder) => encodeURIComponent(placeholder === 'nospace' ? term.replace(/\s+/g, '') : term));

/**
 * Valide le modèle d'URL d'un site ; lève une erreur affichable. Sans {{name}} ni {{nospace}}, le terme va à la fin (préfixe).
 * Le domaine doit être fixe : le contenu d'une fiche ne doit pas décider du site contacté.
 */
export function parseSiteTemplate(input: string): string {
	const text = withScheme(input.trim());
	const template = text.includes(NAME_PLACEHOLDER) || text.includes(NOSPACE_PLACEHOLDER) ? text : text + NAME_PLACEHOLDER;
	const [a, b] = ['a', 'b'].map((term) => parseLinkUrl(fillTemplate(template, term)));
	if (!text || !a || !b || new URL(a).host !== new URL(b).host)
		throw new Error(`Modèle invalide : http(s), domaine fixe, ${NAME_PLACEHOLDER} après le domaine.`);
	return template;
}

/**
 * URL d'un site ; null si le modèle n'est pas valable. Le nom de la fiche est encodé en entier (« AC/DC » reste un
 * seul mot). Un terme propre (`explicit`) peut être un chemin (« model/name », « / » gardés, « . » et « .. » retirés)
 * ou l'adresse complète d'une page de ce site ; jamais d'un autre domaine. Il est pris tel quel, même pour {{nospace}}.
 */
export function buildSiteUrl(site: Site, term: string, explicit = false): string | null {
	if (!explicit) return parseLinkUrl(fillTemplate(site.urlTemplate, term));
	const direct = /^https?:\/\//i.test(term) ? parseLinkUrl(term) : null;
	const siteUrl = parseLinkUrl(fillTemplate(site.urlTemplate, 'x'));
	if (direct && siteUrl && new URL(direct).host === new URL(siteUrl).host) return direct;
	const segments = term.split('/').filter((part) => part && part !== '.' && part !== '..');
	const path = segments.map(encodeURIComponent).join('/');
	return parseLinkUrl(fill(site.urlTemplate, () => path));
}

/**
 * Liens à afficher : sites de sa collection affichés sur la fiche (voir `siteShown`),
 * avec le nom de la fiche sauf terme propre, puis liens saisis non masqués.
 */
export function entryLinks(
	entry: Pick<EntryData, 'name' | 'links' | 'siteTerms' | 'hiddenSites' | 'shownSites'>,
	sites: Site[] = []
): Link[] {
	const fromSites = sites
		.filter((site) => siteShown(entry, site))
		.flatMap((site) => {
			const term = entry.siteTerms?.[site.id]?.trim();
			const url = term ? buildSiteUrl(site, term, true) : buildSiteUrl(site, entry.name);
			return url ? [{ url, label: site.label }] : [];
		});
	return [...fromSites, ...entry.links.filter((link) => !link.hidden)];
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

/**
 * Fiche de la même collection qui porte déjà ce nom (sans casse ni accents), hors `exceptId` (la fiche modifiée).
 * La corbeille n'est pas comptée : à l'appelant de ne passer que les fiches vivantes.
 */
export function findSameName<T extends { id: string; name: string; collectionId: string }>(
	items: T[],
	collectionId: string,
	name: string,
	exceptId?: string
): T | undefined {
	const key = searchKey(name);
	if (!key) return undefined;
	return items.find((item) => item.collectionId === collectionId && item.id !== exceptId && searchKey(item.name) === key);
}

/** Nom d'une fiche restaurée alors que le sien est pris : « École (2026-10-30 21:45:12) », heure locale. */
export function restoredName(name: string, at: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
	const suffix = ` (${date} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())})`;
	return name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
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

export type SortOrder = 'name' | 'created' | 'updated' | 'random' | 'rating' | 'rank';
type Sortable = { id: string; name: string; createdAt: number; updatedAt: number; rating?: number };

/**
 * Rang pseudo-aléatoire d'une fiche (FNV-1a de « graine:id ») : même graine, même ordre, sans rien mémoriser ;
 * une nouvelle graine remélange. Rien de cryptographique, sert seulement à l'affichage.
 */
export function shuffleRank(id: string, seed: number): number {
	let hash = 0x811c9dc5;
	for (const char of `${seed}:${id}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Par nom (A→Z), du plus récent au plus ancien, de la meilleure note à la moins bonne (non notées à la fin),
 * par classement (non classées à la fin), ou mélangé selon `seed` ; à égalité, par nom.
 */
export const sortBy =
	(order: SortOrder, seed = 0, rank: (id: string) => number | undefined = () => undefined) =>
	(a: Sortable, b: Sortable): number => {
		if (order === 'rank') return (rank(a.id) ?? Infinity) - (rank(b.id) ?? Infinity) || byName(a, b);
		if (order === 'created') return b.createdAt - a.createdAt || byName(a, b);
		if (order === 'updated') return b.updatedAt - a.updatedAt || byName(a, b);
		if (order === 'random') return shuffleRank(a.id, seed) - shuffleRank(b.id, seed) || byName(a, b);
		if (order === 'rating') return (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b);
		return byName(a, b);
	};

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

// ---------------------------------------------------------------------------
// Navigation entre fiches

/** Position de `id` dans `ids` et ses voisines ; null s'il n'y figure pas. Pas de boucle : les extrémités s'arrêtent. */
export function neighbours(ids: string[], id: string): { position: number; count: number; previous?: string; next?: string } | null {
	const index = ids.indexOf(id);
	return index < 0 ? null : { position: index + 1, count: ids.length, previous: ids[index - 1], next: ids[index + 1] };
}

// ---------------------------------------------------------------------------
// Note

export const MAX_RATING = 10;

/** Entier de 1 à `MAX_RATING`, sinon undefined (pas notée) : une valeur hors bornes ne s'enregistre pas. */
export const parseRating = (value: unknown): number | undefined =>
	Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_RATING ? (value as number) : undefined;

/** En étoiles, à la française : 9 → « 4,5 ». */
export const formatRating = (rating: number): string => (rating / 2).toLocaleString('fr-FR');

/** 0 : toutes les notes ; `UNRATED` : seulement les fiches sans note ; sinon note minimale (1 à `MAX_RATING`). */
export type RatingFilter = number;

export const UNRATED = -1;

export const matchesRatingFilter = (rating: number | undefined, filter: RatingFilter): boolean =>
	filter === 0 || (filter === UNRATED ? rating === undefined : (rating ?? 0) >= filter);

// ---------------------------------------------------------------------------
// Pays : code ISO stocké ; drapeau et nom français calculés à l'affichage, aucune liste de noms à maintenir.

/** ISO 3166-1 alpha-2 : un code hors de cette liste ne s'enregistre pas. */
export const COUNTRY_CODES = (
	'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
	'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
	'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
	'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
	'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
	'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
	'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');
const COUNTRY_SET = new Set(COUNTRY_CODES);

/** Proposés en premier à la saisie, avec les pays déjà utilisés. */
export const FAVORITE_COUNTRIES = ['FR', 'ES', 'DE', 'IT', 'GB', 'UA', 'RU', 'PL', 'BR', 'CO', 'AU'];

export const parseCountry = (value: unknown): string | undefined =>
	typeof value === 'string' && COUNTRY_SET.has(value) ? value : undefined;

/** Drapeau emoji : deux « lettres régionales » Unicode. Windows les affiche en lettres (FR), pas en drapeau. */
export const countryFlag = (code: string): string =>
	String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));

const regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
export const countryName = (code: string): string => regionNames.of(code) ?? code;

/** Libellé d'une suggestion de saisie : « 🇫🇷 France (FR) ». */
export const countryLabel = (code: string): string => `${countryFlag(code)} ${countryName(code)} (${code})`;

/** Saisie libre → code : « fr », « France », « france » (sans casse ni accents) ou une suggestion choisie. */
export function resolveCountry(input: string): string | undefined {
	const text = input.trim();
	const code = /\(([A-Za-z]{2})\)$/.exec(text)?.[1] ?? (/^[A-Za-z]{2}$/.test(text) ? text : null);
	if (code) return parseCountry(code.toUpperCase());
	const key = searchKey(text);
	return key ? COUNTRY_CODES.find((c) => searchKey(countryName(c)) === key) : undefined;
}

/** '' : tous les pays ; 'none' : sans pays ; sinon un code. */
export type CountryFilter = string;

export const matchesCountryFilter = (country: string | undefined, filter: CountryFilter): boolean =>
	!filter || (filter === 'none' ? !country : country === filter);

/** `withLinks` : seulement les fiches qui affichent au moins un lien (sites de la collection compris). */
export const matchesLinkFilter = (linkCount: number, withLinks: boolean): boolean => !withLinks || linkCount > 0;

// ---------------------------------------------------------------------------
// Import d'une liste de noms

export const MAX_NAME_LENGTH = 200;

/**
 * Un nom par ligne. Ignore les lignes vides et les doublons (casse et accents ignorés),
 * qu'ils soient déjà dans les fiches existantes ou répétés dans la liste ; `duplicates` les nomme.
 */
export function parseNameList(text: string, existingNames: string[]): { names: string[]; duplicates: string[] } {
	const seen = new Set(existingNames.map(searchKey));
	const names: string[] = [];
	const duplicates: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const name = line.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
		if (!name) continue;
		const key = searchKey(name);
		if (seen.has(key)) {
			duplicates.push(name);
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
