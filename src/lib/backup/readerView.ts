/**
 * Vue d'une sauvegarde lue (voir reader.ts), pour l'outil de déchiffrement : par collection, dans l'ordre du catalogue,
 * fiches par nom puis corbeille à part. Rang, tags par catégorie et liens calculés comme dans l'app. Fonction pure.
 */
import type { Bytes } from '$lib/crypto/encoding';
import { type Link, byName, entryLinks, groupTags, parseLinkUrl, rankedIds } from '$lib/entries/model';
import type { BackupReading, ReadEntry } from './reader';

export type ViewEntry = {
	id: string;
	name: string;
	hidden: boolean;
	deletedAt?: number;
	/** Rang au classement de la collection (1 = la meilleure), fiches vivantes seulement. */
	rank?: number;
	rating?: number;
	country?: string;
	birthYear?: number;
	remarks?: string;
	tags: { group: string | null; names: string[] }[];
	links: Link[];
	/** Types d'image connus seulement : le fichier ne choisit pas ce que le navigateur interprète. */
	imageType?: string;
	thumb?: Bytes;
	image?: Bytes;
};

export type ViewCollection = {
	id: string;
	name: string;
	hidden: boolean;
	entries: ViewEntry[];
	trash: ViewEntry[];
	ranked: number;
};

const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

export function backupView(reading: BackupReading): ViewCollection[] {
	return reading.collections.map((collection) => {
		const own = reading.entries.filter((entry) => entry.collectionId === collection.id).sort(byName);
		const live = own.filter((entry) => !entry.deletedAt);
		const ranks = new Map(rankedIds(collection.ranking, live).map((id, i) => [id, i + 1]));
		const tags = reading.tags.filter((tag) => tag.collectionId === collection.id);

		const view = (entry: ReadEntry): ViewEntry => {
			const imageType = entry.imageType && IMAGE_TYPES.includes(entry.imageType) ? entry.imageType : undefined;
			const entryTags = tags.filter((tag) => entry.tagIds?.includes(tag.id));
			return {
				id: entry.id,
				name: entry.name,
				hidden: !!entry.hidden,
				...(entry.deletedAt && { deletedAt: entry.deletedAt }),
				...(!entry.deletedAt && ranks.has(entry.id) && { rank: ranks.get(entry.id) }),
				...(entry.rating && { rating: entry.rating }),
				...(entry.country && { country: entry.country }),
				...(entry.birthYear && { birthYear: entry.birthYear }),
				...(typeof entry.remarks === 'string' && entry.remarks && { remarks: entry.remarks }),
				tags: groupTags(entryTags, collection.tagGroups ?? []).map((section) => ({
					group: section.group?.name ?? null,
					names: section.tags.map((tag) => tag.name)
				})),
				// Un lien saisi qui n'est pas en http(s) ne devient pas cliquable.
				links: entryLinks(entry, collection.sites).flatMap((link) => {
					const url = parseLinkUrl(link.url);
					return url ? [{ ...link, url }] : [];
				}),
				...(imageType && { imageType }),
				...(imageType && entry.thumb && { thumb: entry.thumb }),
				...(imageType && entry.image && { image: entry.image })
			};
		};
		return {
			id: collection.id,
			name: collection.name,
			hidden: !!collection.hidden,
			entries: live.map(view),
			trash: own.filter((entry) => entry.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!).map(view),
			ranked: ranks.size
		};
	});
}
