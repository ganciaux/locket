/**
 * Album d'une collection : toutes ses fiches face cachée, rangées par classement, qui se découvrent une à une par
 * tirage au sort (sans remise). Les fiches découvertes sont dans le catalogue chiffré (`Collection.discovered`), donc
 * synchronisées entre appareils. Fonctions pures.
 */

/** Ordre de l'album : les classées par rang, puis les autres par nom (`items` déjà triées par nom). */
export function albumOrder<T extends { id: string }>(items: T[], ranking: string[]): T[] {
	const byId = new Map(items.map((item) => [item.id, item]));
	const ranked = ranking.flatMap((id) => byId.get(id) ?? []);
	const rankedIds = new Set(ranked.map((item) => item.id));
	return [...ranked, ...items.filter((item) => !rankedIds.has(item.id))];
}

/** Découvertes encore valables : fiches toujours dans la collection (ni supprimées ni déplacées). */
export const discoveredIn = (discovered: string[] | undefined, ids: string[]): Set<string> => {
	const known = new Set(ids);
	return new Set((discovered ?? []).filter((id) => known.has(id)));
};

/** Une carte encore face cachée, au hasard ; undefined si l'album est complet. */
export function pickHidden(ids: string[], discovered: Set<string>, draw = Math.random): string | undefined {
	const hidden = ids.filter((id) => !discovered.has(id));
	return hidden.length ? hidden[Math.floor(draw() * hidden.length)] : undefined;
}

/** Liste à enregistrer après la découverte de `id` : sans doublon, et sans les fiches qui ne sont plus là. */
export const withDiscovered = (discovered: string[] | undefined, id: string, ids: string[]): string[] => [
	...[...discoveredIn(discovered, ids)].filter((other) => other !== id),
	id
];
