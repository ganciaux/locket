/**
 * Fiches ressemblantes, calculées dans le navigateur à partir de ce qui est déjà déchiffré : rien ne sort de l'appareil.
 * Image : couleurs et composition d'une version 8 × 8 de la miniature. Elle ne reconnaît ni un visage ni un sujet.
 */
import { imageFingerprint } from './images';
import { searchKey } from './model';
import type { EntrySummary } from './repository';

type Comparable = { name: string; tagIds?: string[]; country?: string; fingerprint?: Uint8ClampedArray | null };

const MIN_SCORE = 0.3;
const MAX_RESULTS = 12;
// Écart moyen par canal à partir duquel deux images n'ont plus rien de commun (sur 255).
const IMAGE_DISTANCE = 90;

const overlap = (a: Set<string>, b: Set<string>): number => {
	const union = new Set([...a, ...b]).size;
	return union ? [...a].filter((item) => b.has(item)).length / union : 0;
};

const words = (name: string) => new Set(searchKey(name).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));

function imageScore(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
	const distance = a.reduce((total, value, i) => total + Math.abs(value - b[i]), 0) / a.length;
	return Math.max(0, 1 - distance / IMAGE_DISTANCE);
}

/** Moyenne pondérée de 0 à 1 ; un critère absent des deux fiches ne pèse pas, plutôt que de compter comme une différence. */
export function similarity(a: Comparable, b: Comparable): number {
	const scores: [number, number][] = [[overlap(words(a.name), words(b.name)), 0.15]];
	if (a.fingerprint && b.fingerprint) scores.push([imageScore(a.fingerprint, b.fingerprint), 0.5]);
	if (a.tagIds?.length || b.tagIds?.length) scores.push([overlap(new Set(a.tagIds), new Set(b.tagIds)), 0.25]);
	if (a.country && b.country) scores.push([a.country === b.country ? 1 : 0, 0.1]);
	const weight = scores.reduce((total, [, w]) => total + w, 0);
	return scores.reduce((total, [score, w]) => total + score * w, 0) / weight;
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

/** Les fiches les plus proches, de la plus ressemblante à la moins ressemblante. */
export async function findSimilar<T extends EntrySummary>(entry: T, candidates: T[]): Promise<T[]> {
	const source = { ...entry, fingerprint: await fingerprintOf(entry) };
	const scored: { item: T; score: number }[] = [];
	for (const item of candidates) {
		if (item.id === entry.id) continue;
		const score = similarity(source, { ...item, fingerprint: await fingerprintOf(item) });
		if (score >= MIN_SCORE) scored.push({ item, score });
	}
	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, MAX_RESULTS)
		.map(({ item }) => item);
}
