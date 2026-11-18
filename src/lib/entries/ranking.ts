/**
 * Classement par collection, stocké dans son catalogue (`Collection.ranking`, `rankingDraft`) ; lecture par `entries`.
 */
import { type Collection, withRanked, withSliceRest } from './model';
import { replaceCollections } from './collections';
import { data, entries, loaded } from './store.svelte';

const updateRankings = (collectionId: string, change: (collection: Collection) => Partial<Collection>): Promise<void> =>
	replaceCollections(loaded(data.collections).map((c) => (c.id === collectionId ? { ...c, ...change(c) } : c)));

/**
 * Classe une fiche au rang `index` (à partir de 0) de `ranked`, le classement effectif sans elle, dans celui qui reçoit
 * les duels. Les ids de fiches supprimées pour de bon sont oubliés au passage.
 */
export function placeInRanking(collectionId: string, id: string, ranked: string[], index: number): Promise<void> {
	const known = new Set((data.items ?? []).map((item) => item.id));
	return updateRankings(collectionId, ({ ranking, rankingDraft }) =>
		rankingDraft
			? { rankingDraft: withRanked(rankingDraft, ranked, id, index, known) }
			: { ranking: withRanked(ranking, ranked, id, index, known) }
	);
}

/** La fiche redevient non classée, y compris dans un nouveau classement en cours ; les suivantes remontent d'un rang. */
export const removeFromRanking = (collectionId: string, id: string): Promise<void> =>
	updateRankings(collectionId, ({ ranking = [], rankingDraft, rankingSlice }) => ({
		ranking: ranking.filter((other) => other !== id),
		rankingDraft: rankingDraft?.filter((other) => other !== id),
		rankingSlice: rankingSlice && { ...rankingSlice, ids: rankingSlice.ids.filter((other) => other !== id) }
	}));

/** Repart de zéro à côté du classement actuel, qui reste affiché jusqu'à `finishNewRanking`. */
export const startNewRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ rankingDraft: [], rankingSlice: undefined }));

/**
 * Affine les rangs `from` à `to` (à partir de 1, compris) : le nouveau classement est l'actuel sans ces fiches, que les
 * duels replacent entre elles ; l'actuel reste affiché jusqu'à `finishNewRanking`.
 */
export function startSliceRanking(collectionId: string, from: number, to: number): Promise<void> {
	const ranked = entries.ranking(collectionId);
	if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > ranked.length || to - from < 1)
		return Promise.reject(new Error(`Choisissez au moins deux rangs entre 1 et ${ranked.length}.`));
	const ids = ranked.slice(from - 1, to);
	const members = new Set(ids);
	return updateRankings(collectionId, ({ ranking = [] }) => ({
		rankingDraft: ranking.filter((id) => !members.has(id)),
		rankingSlice: { ids, start: from - 1 }
	}));
}

/**
 * Le nouveau classement remplace l'actuel, même incomplet : les fiches absentes redeviennent non classées. Affinage d'une
 * tranche : celles pas encore replacées gardent leur ancien ordre, à la suite des autres.
 */
export function finishNewRanking(collectionId: string): Promise<void> {
	const known = new Set((data.items ?? []).map((item) => item.id));
	const items = (data.items ?? []).filter((item) => item.collectionId === collectionId && !item.deletedAt);
	return updateRankings(collectionId, ({ ranking, rankingDraft, rankingSlice }) => ({
		ranking: rankingDraft && rankingSlice ? withSliceRest(rankingDraft, rankingSlice, items, known) : (rankingDraft ?? ranking),
		rankingDraft: undefined,
		rankingSlice: undefined
	}));
}

export const abandonNewRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ rankingDraft: undefined, rankingSlice: undefined }));

/** Toutes les fiches redeviennent non classées, nouveau classement en cours compris. */
export const deleteRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ ranking: undefined, rankingDraft: undefined, rankingSlice: undefined }));
