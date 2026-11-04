/**
 * Fiches ressemblantes, calculées dans le navigateur à partir de ce qui est déjà déchiffré : rien ne sort de l'appareil.
 * Image : couleurs dominantes et composition d'une version 16 × 16 de la miniature. Elle ne reconnaît ni un visage ni un sujet.
 */
import { imageFingerprint } from './images';
import { searchKey } from './model';
import type { EntrySummary } from './repository';

type Comparable = { name: string; tagIds?: string[]; country?: string; fingerprint?: Uint8ClampedArray | null };
export type Criterion = 'image' | 'tags' | 'name' | 'country';
/** Score de 0 à 1 et détail par critère ; un critère absent n'était pas comparable (donnée manquante d'un côté). */
export type Similarity = { score: number; details: Partial<Record<Criterion, number>> };

const WEIGHTS: Record<Criterion, number> = { image: 0.35, tags: 0.35, name: 0.15, country: 0.15 };
// Sans image ni tags, nom et pays seuls rapprocheraient toutes les fiches d'un même pays : pas assez pour conclure.
const MIN_WEIGHT = 0.5;
const MIN_SCORE = 0.3;
const MAX_RESULTS = 10;
// Écart moyen par canal à partir duquel deux compositions n'ont plus rien de commun (sur 255).
const IMAGE_DISTANCE = 90;

const overlap = (a: Set<string>, b: Set<string>): number => {
	const union = new Set([...a, ...b]).size;
	return union ? [...a].filter((item) => b.has(item)).length / union : 0;
};

const words = (name: string) => new Set(searchKey(name).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));

/** Répartition des pixels en 64 couleurs (4 niveaux par canal), en proportions. */
function colorHistogram(rgb: Uint8ClampedArray): number[] {
	const bins = new Array<number>(64).fill(0);
	const pixels = rgb.length / 3;
	for (let i = 0; i < rgb.length; i += 3) bins[(rgb[i] >> 6) * 16 + (rgb[i + 1] >> 6) * 4 + (rgb[i + 2] >> 6)] += 1 / pixels;
	return bins;
}

/** Moitié couleurs (indépendantes du cadrage), moitié composition (pixel à pixel). */
function imageScore(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
	const ha = colorHistogram(a);
	const hb = colorHistogram(b);
	const colors = ha.reduce((total, value, i) => total + Math.min(value, hb[i]), 0);
	const distance = a.reduce((total, value, i) => total + Math.abs(value - b[i]), 0) / a.length;
	const layout = Math.max(0, 1 - distance / IMAGE_DISTANCE);
	return (colors + layout) / 2;
}

/**
 * Moyenne pondérée des critères renseignés des deux côtés, rapportée à leur poids total : un critère manquant
 * ne compte pas comme une différence. Score nul si ces critères pèsent moins de `MIN_WEIGHT`.
 */
export function similarity(a: Comparable, b: Comparable): Similarity {
	const details: Similarity['details'] = {};
	if (a.fingerprint && b.fingerprint) details.image = imageScore(a.fingerprint, b.fingerprint);
	if (a.tagIds?.length && b.tagIds?.length) details.tags = overlap(new Set(a.tagIds), new Set(b.tagIds));
	const [wordsA, wordsB] = [words(a.name), words(b.name)];
	if (wordsA.size && wordsB.size) details.name = overlap(wordsA, wordsB);
	if (a.country && b.country) details.country = a.country === b.country ? 1 : 0;
	const criteria = Object.entries(details) as [Criterion, number][];
	const weight = criteria.reduce((total, [criterion]) => total + WEIGHTS[criterion], 0);
	const score = weight >= MIN_WEIGHT ? criteria.reduce((total, [c, value]) => total + value * WEIGHTS[c], 0) / weight : 0;
	return { score, details };
}

// Par objet : une fiche modifiée est un nouvel objet, et tout disparaît avec la liste au verrouillage.
const fingerprints = new WeakMap<object, Promise<Uint8ClampedArray | null>>();

function fingerprintOf(entry: EntrySummary): Promise<Uint8ClampedArray | null> {
	if (!entry.thumb || !entry.imageType) return Promise.resolve(null);
	let known = fingerprints.get(entry);
	if (!known) {
		known = imageFingerprint(entry.thumb, entry.imageType).catch(() => null);
		fingerprints.set(entry, known);
	}
	return known;
}

/** Les fiches les plus proches, de la plus ressemblante à la moins ressemblante, avec leurs scores. */
export async function findSimilar<T extends EntrySummary>(entry: T, candidates: T[]): Promise<(Similarity & { item: T })[]> {
	const source = { ...entry, fingerprint: await fingerprintOf(entry) };
	const scored: (Similarity & { item: T })[] = [];
	for (const item of candidates) {
		if (item.id === entry.id) continue;
		const result = similarity(source, { ...item, fingerprint: await fingerprintOf(item) });
		if (result.score >= MIN_SCORE) scored.push({ ...result, item });
	}
	return scored.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

/**
 * Tags à proposer d'après les fiches ressemblantes : chaque tag reçoit la somme des scores des fiches qui le portent,
 * les plus proches et les plus fréquents d'abord. Ceux de `exclude` (déjà posés) sont écartés.
 */
export function suggestTags(similar: { score: number; tagIds?: string[] }[], exclude: string[], limit = 6): string[] {
	const weights = new Map<string, number>();
	for (const { score, tagIds } of similar)
		for (const id of tagIds ?? []) if (!exclude.includes(id)) weights.set(id, (weights.get(id) ?? 0) + score);
	return [...weights].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
