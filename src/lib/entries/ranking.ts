/**
 * Classement par collection, stocké dans son catalogue (`Collection.ranking`, `rankingDraft`) ; lecture par `entries`.
 */
import { type Collection, withRanked } from './model';
import { replaceCollections } from './collections';
import { data, loaded } from './store.svelte';

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
	updateRankings(collectionId, ({ ranking = [], rankingDraft }) => ({
		ranking: ranking.filter((other) => other !== id),
		rankingDraft: rankingDraft?.filter((other) => other !== id)
	}));

/** Repart de zéro à côté du classement actuel, qui reste affiché jusqu'à `finishNewRanking`. */
export const startNewRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ rankingDraft: [] }));

/** Le nouveau classement remplace l'actuel, même incomplet : les fiches absentes redeviennent non classées. */
export const finishNewRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, ({ ranking, rankingDraft }) => ({ ranking: rankingDraft ?? ranking, rankingDraft: undefined }));

export const abandonNewRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ rankingDraft: undefined }));

/** Toutes les fiches redeviennent non classées, nouveau classement en cours compris. */
export const deleteRanking = (collectionId: string): Promise<void> =>
	updateRankings(collectionId, () => ({ ranking: undefined, rankingDraft: undefined }));
