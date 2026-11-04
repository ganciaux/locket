/**
 * Statistiques d'une collection, calculées en mémoire sur les fiches déjà déchiffrées : rien n'est lu ni écrit en plus.
 * Fonctions pures, testées ; la page `/stats` ne fait que les afficher.
 */
import { type Tag, type TagGroup, groupTags, missingFields } from './model';

type StatsEntry = {
	id: string;
	country?: string;
	birthYear?: number;
	rating?: number;
	imageType?: string;
	tagIds?: string[];
	hidden?: boolean;
};

/** Une ligne d'une répartition : `key` stable pour l'affichage, `count` fiches. */
export type Bucket = { key: string; count: number };

export type CategoryCoverage = { group: TagGroup; covered: number; top: { tag: Tag; count: number }[] };

export type CollectionStats = {
	total: number;
	hidden: number;
	withImage: number;
	rated: number;
	ranked: number;
	incomplete: number;
	/** Étoiles pleines de 5 à 1 (une demi-étoile compte avec l'étoile du dessous), puis `none`. */
	ratings: Bucket[];
	/** Codes pays, du plus fréquent au moins fréquent, puis `none`. */
	countries: Bucket[];
	/** Décennies de naissance (« 1980 »), de la plus ancienne à la plus récente, puis `none`. */
	decades: Bucket[];
	categories: CategoryCoverage[];
};

const TOP_TAGS = 5;

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
	return counts;
}

/** `none` en dernier, et seulement s'il compte au moins une fiche. */
const withNone = (buckets: Bucket[], none: number): Bucket[] => (none ? [...buckets, { key: 'none', count: none }] : buckets);

export function collectionStats(entries: StatsEntry[], tags: Tag[], groups: TagGroup[], ranking: string[]): CollectionStats {
	const ranked = new Set(ranking);
	const known = new Set(tags.map((tag) => tag.id));

	const ratingCounts = countBy(
		entries.filter((entry) => entry.rating),
		(entry) => String(Math.floor(entry.rating! / 2) || 1)
	);
	const ratings = ['5', '4', '3', '2', '1'].map((key) => ({ key, count: ratingCounts.get(key) ?? 0 })).filter((b) => b.count);

	const countryCounts = countBy(
		entries.filter((entry) => entry.country),
		(entry) => entry.country!
	);
	const countries = [...countryCounts]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

	const decadeCounts = countBy(
		entries.filter((entry) => entry.birthYear),
		(entry) => String(Math.floor(entry.birthYear! / 10) * 10)
	);
	const decades = [...decadeCounts].map(([key, count]) => ({ key, count })).sort((a, b) => Number(a.key) - Number(b.key));

	const categories = groupTags(tags, groups).flatMap(({ group, tags: groupTagList }) => {
		if (!group) return [];
		const ids = new Set(groupTagList.map((tag) => tag.id));
		const covered = entries.filter((entry) => entry.tagIds?.some((id) => ids.has(id))).length;
		const top = groupTagList
			.map((tag) => ({ tag, count: entries.filter((entry) => entry.tagIds?.includes(tag.id)).length }))
			.filter(({ count }) => count)
			.sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name, 'fr'))
			.slice(0, TOP_TAGS);
		return [{ group, covered, top }];
	});

	return {
		total: entries.length,
		hidden: entries.filter((entry) => entry.hidden).length,
		withImage: entries.filter((entry) => entry.imageType).length,
		rated: entries.filter((entry) => entry.rating).length,
		ranked: entries.filter((entry) => ranked.has(entry.id)).length,
		incomplete: entries.filter(
			(entry) => missingFields({ ...entry, tagIds: entry.tagIds?.filter((id) => known.has(id)) }, tags, groups).length
		).length,
		ratings: withNone(ratings, entries.filter((entry) => !entry.rating).length),
		countries: withNone(countries, entries.filter((entry) => !entry.country).length),
		decades: withNone(decades, entries.filter((entry) => !entry.birthYear).length),
		categories
	};
}
