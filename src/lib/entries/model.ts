/** Modèle d'une fiche et règles pures (sans Firebase ni DOM), testées dans model.test.ts. */

import { byName, MAX_NAME_LENGTH, searchKey } from './text';
import { type Collection } from './types';

// Réexporte les modules par domaine : les imports existants de `model` restent valables.
export * from './types';
export * from './text';
export * from './sites';
export * from './tags';
export * from './duels';
export * from './countries';
export * from './docSize';
export * from './framing';
export * from './borders';
export * from './undo';
export * from './gallery';

export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Jours restants avant la suppression définitive (au moins 0). */
export const trashDaysLeft = (deletedAt: number, now: number): number =>
	Math.max(0, Math.ceil(TRASH_DAYS - (now - deletedAt) / DAY_MS));

export const isTrashExpired = (deletedAt: number | undefined, now: number): boolean =>
	deletedAt !== undefined && now - deletedAt >= TRASH_DAYS * DAY_MS;

/**
 * Une fiche dont la collection est inconnue (catalogue perdu ou altéré) deviendrait invisible : sa collection
 * est recréée avec un nom provisoire, à renommer. Elle n'est écrite qu'à la prochaine modification du catalogue.
 */
export function withRecoveredCollections(collections: Collection[], entries: { collectionId: string }[]): Collection[] {
	const known = new Set(collections.map((c) => c.id));
	const missing = [...new Set(entries.map((entry) => entry.collectionId))].filter((id) => !known.has(id));
	return [...collections, ...missing.map((id, i) => ({ id, name: `Collection récupérée ${i + 1}` }))];
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

/**
 * Liste de noms (un par ligne) comparée à une collection : absents (doublons retirés, sans casse ni accents) et déjà
 * présents avec leur fiche (`find`) ; dans l'ordre saisi, ou triés par nom.
 */
export function compareNames<T>(
	text: string,
	find: (key: string) => T | undefined,
	sorted: boolean
): { missing: string[]; found: { name: string; entry: T }[]; duplicates: number } {
	const seen = new Set<string>();
	const missing: string[] = [];
	const found: { name: string; entry: T }[] = [];
	let duplicates = 0;
	for (const line of text.split(/\r?\n/)) {
		const name = line.trim().replace(/\s+/g, ' ');
		if (!name) continue;
		const key = searchKey(name);
		if (seen.has(key)) {
			duplicates++;
			continue;
		}
		seen.add(key);
		const entry = find(key);
		if (entry) found.push({ name, entry });
		else missing.push(name);
	}
	if (sorted) {
		missing.sort((a, b) => byName({ name: a }, { name: b }));
		found.sort(byName);
	}
	return { missing, found, duplicates };
}

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
// Navigation entre fiches

/** Position de `id` dans `ids` et ses voisines ; null s'il n'y figure pas. Pas de boucle : les extrémités s'arrêtent. */
export function neighbours(ids: string[], id: string): { position: number; count: number; previous?: string; next?: string } | null {
	const index = ids.indexOf(id);
	return index < 0 ? null : { position: index + 1, count: ids.length, previous: ids[index - 1], next: ids[index + 1] };
}

/** Fiche au hasard parmi `ids`, autre que `avoid` s'il y a le choix (relancer change de fiche). */
export function pickRandom(ids: string[], avoid?: string, random = Math.random): string | undefined {
	const choices = ids.length > 1 ? ids.filter((id) => id !== avoid) : ids;
	return choices[Math.floor(random() * choices.length)];
}

// ---------------------------------------------------------------------------
// Validée

/** '' : toutes ; 'todo' : à valider ; 'done' : validées. */
export type ValidatedFilter = '' | 'todo' | 'done';

/** Choix du filtre « Statut », sur « Mes fiches » et l'index. */
export const VALIDATED_CHOICES: { value: Exclude<ValidatedFilter, ''>; label: string }[] = [
	{ value: 'todo', label: 'À valider' },
	{ value: 'done', label: 'Validées' }
];

export const matchesValidatedFilter = (validatedAt: number | undefined, filter: ValidatedFilter): boolean =>
	filter === '' || (filter === 'done') === !!validatedAt;

/** Fiches modifiables par une action groupée : les validées sont laissées de côté. */
export const notValidated = <T extends { validatedAt?: number }>(items: T[]): T[] => items.filter((item) => !item.validatedAt);

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

export const MIN_BIRTH_YEAR = 1000;

/** Entière, de `MIN_BIRTH_YEAR` à l'année en cours : un âge négatif n'a pas de sens. */
export const parseBirthYear = (value: unknown, thisYear = new Date().getFullYear()): number | undefined =>
	Number.isInteger(value) && (value as number) >= MIN_BIRTH_YEAR && (value as number) <= thisYear ? (value as number) : undefined;

/** Âge atteint dans l'année (sans la date, l'anniversaire peut être encore à venir) : 1991 → « 35 ans » en 2026. */
export function formatAge(birthYear: number, thisYear = new Date().getFullYear()): string {
	const age = thisYear - birthYear;
	return `${age} an${age > 1 ? 's' : ''}`;
}

/** `withLinks` : seulement les fiches qui affichent au moins un lien (sites de la collection compris). */
export const matchesLinkFilter = (linkCount: number, withLinks: boolean): boolean => !withLinks || linkCount > 0;
