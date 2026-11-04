/**
 * Fiches, collections et tags déchiffrés en mémoire, chargés une fois après le déverrouillage puis tenus à jour localement.
 * Vidés dès que la session est verrouillée : rien de déchiffré ne survit à la DEK.
 * La liste, la recherche et les tags proposés sont ceux de la collection active (préférence propre à l'appareil).
 */
import { verifyPassword } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { prefs } from '$lib/prefs.svelte';
import { collectionCatalog, tagCatalog } from './catalog';
import { whenStale } from './stale';
import type { Bytes } from '$lib/crypto/encoding';
import { bytesToUrl, isFullSizeThumb, rebuildThumb } from './images';
import {
	NO_TAG_FILTER,
	type Collection,
	type EntryData,
	type Link,
	type Site,
	type SortOrder,
	type Tag,
	type TagFilter,
	type TagGroup,
	type TagIndex,
	byName,
	entryLinks,
	isRankable,
	rankedIds,
	findSameName,
	withSiteVisibility,
	restoredName,
	isTrashExpired,
	type CountryFilter,
	type RatingFilter,
	matchesCountryFilter,
	groupTags,
	matchesFilter,
	matchesLinkFilter,
	matchesRatingFilter,
	parseRating,
	sortBy,
	withRecoveredCollections
} from './model';
import type { ImportPlan } from './importTable';
import {
	createEntries,
	deleteEntries,
	deleteEntry,
	deleteRemainingImages,
	deleteStoredEntriesExcept,
	getImage,
	listEntries,
	patchStoredEntries,
	saveThumbs,
	type EntrySummary
} from './repository';

export type ListItem = EntrySummary & { thumbUrl?: string };

// Écrit aussi par collections.ts et ranking.ts ; ailleurs, lire par `entries`.
// Champs `$state.raw` : réassignés en entier, jamais modifiés en place.
class EntriesData {
	items = $state.raw<ListItem[] | null>(null);
	tags = $state.raw<Tag[] | null>(null);
	collections = $state.raw<Collection[] | null>(null);
}
export const data = new EntriesData();

let unreadableIds = $state.raw<string[]>([]);
let catalogDamaged = $state(false);
// Graine du tri aléatoire : fixée pour la session, l'ordre ne change pas à chaque retour sur la liste.
let shuffleSeed = $state(Math.random());
let loading: Promise<void> | null = null;

// Catégorie connue de chaque tag (une catégorie supprimée vaut « sans catégorie »), comme à l'affichage.
const tagIndex: TagIndex = $derived(
	new Map(
		(data.collections ?? []).flatMap((collection) =>
			groupTags(
				(data.tags ?? []).filter((tag) => tag.collectionId === collection.id),
				collection.tagGroups ?? []
			).flatMap((section) => section.tags.map((tag) => [tag.id, { name: tag.name, group: section.group?.id ?? '' }] as const))
		)
	)
);
// Collection choisie sur cet appareil ; si elle n'existe plus (ou jamais choisie), la première.
// Collections proposées (menu, sélecteurs) ; une cachée ne peut pas être active, sauf si toutes le sont.
const shownCollections = $derived(data.collections && data.collections.filter((c) => prefs.showHidden || !c.hidden));
const active = $derived(
	data.collections &&
		(shownCollections!.find((c) => c.id === prefs.collectionId) ?? shownCollections![0] ?? data.collections[0] ?? null)
);
// La corbeille reste chargée, mais hors de tout ce qui s'affiche ou se compte.
const liveItems = $derived(data.items && data.items.filter((item) => !item.deletedAt));
const activeItems = $derived(liveItems && liveItems.filter((item) => item.collectionId === active?.id));
const inCollection = (collectionId: string) => (liveItems ?? []).filter((item) => item.collectionId === collectionId);
const rankingOf = (collectionId: string): string[] =>
	rankedIds(data.collections?.find((c) => c.id === collectionId)?.ranking, inCollection(collectionId));
const draftOf = (collectionId: string): string[] | null => {
	const draft = data.collections?.find((c) => c.id === collectionId)?.rankingDraft;
	return draft ? rankedIds(draft, inCollection(collectionId)) : null;
};
// Rangs de la collection active (1 = la meilleure), pour les cartes et le tri.
const activeRanks = $derived(new Map(active ? rankingOf(active.id).map((id, i) => [id, i + 1]) : []));
const activeTags = $derived(data.tags && data.tags.filter((tag) => tag.collectionId === active?.id));

const withThumbUrl = (entry: EntrySummary): ListItem => ({
	...entry,
	thumbUrl: entry.thumb && entry.imageType ? bytesToUrl(entry.thumb, entry.imageType) : undefined
});

const revoke = (item: ListItem | undefined) => item?.thumbUrl && URL.revokeObjectURL(item.thumbUrl);

function clear() {
	data.items?.forEach(revoke);
	data.items = null;
	data.tags = null;
	data.collections = null;
	unreadableIds = [];
	catalogDamaged = false;
	loading = null;
}

$effect.root(() => {
	$effect(() => {
		if (!session.dek) clear();
	});
});

// Écriture refusée (un autre appareil a écrit, voir stale.ts) : tout est relu sans vider l'affichage, pour qu'un
// formulaire ouvert garde sa saisie et puisse être réenregistré.
whenStale(() => {
	loading = null;
	loadEntries().catch(() => {});
});

export const entries = {
	/** Toutes les fiches, toutes collections confondues (pour retrouver une fiche par son id). */
	get items() {
		return data.items;
	},
	/** Fiches de la collection active, triées par nom. */
	get activeItems() {
		return activeItems;
	},
	/** Dans l'ordre choisi par l'utilisateur, cachées comprises (page Collections, recherche par id). */
	get collections() {
		return data.collections;
	},
	/** Celles à proposer : sans les cachées, sauf avec la préférence `showHidden`. */
	get shownCollections() {
		return shownCollections;
	},
	get hiddenCollectionCount() {
		return data.collections?.filter((c) => c.hidden).length ?? 0;
	},
	/** null tant que rien n'est chargé, ou si aucune collection n'existe encore. */
	get active() {
		return active;
	},
	/** Tags de la collection active, triés par nom. */
	get tags() {
		return activeTags;
	},
	/** Catégories de tags de la collection active, dans l'ordre choisi. */
	get tagGroups(): TagGroup[] {
		return active?.tagGroups ?? [];
	},
	tagsIn(collectionId: string): Tag[] {
		return (data.tags ?? []).filter((tag) => tag.collectionId === collectionId);
	},
	/** Fiches qu'aucune clé ne peut déchiffrer : absentes de `items`, leur collection est inconnue. */
	get unreadableCount() {
		return unreadableIds.length;
	},
	/** Tags ou collections illisibles : les fiches restent accessibles, leurs libellés sont perdus sans sauvegarde. */
	get catalogDamaged() {
		return catalogDamaged;
	},
	/** Corbeille, de la suppression la plus récente à la plus ancienne. */
	get trash(): ListItem[] {
		return (data.items ?? []).filter((item) => item.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!);
	},
	/**
	 * Dans la collection active ; `activeItems` reste trié par nom, un autre ordre est appliqué à la copie filtrée.
	 * Les fiches cachées n'apparaissent qu'avec la préférence `showHidden`.
	 */
	search(
		query: string,
		{
			tags = NO_TAG_FILTER,
			withLinks = false,
			rating = 0,
			country = [],
			order = 'name'
		}: { tags?: TagFilter; withLinks?: boolean; rating?: RatingFilter; country?: CountryFilter; order?: SortOrder } = {}
	): ListItem[] {
		const found = (activeItems ?? []).filter(
			(item) =>
				(prefs.showHidden || !item.hidden) &&
				matchesFilter(item, query, tags, tagIndex) &&
				matchesLinkFilter(entries.linksOf(item).length, withLinks) &&
				matchesRatingFilter(item.rating, rating) &&
				matchesCountryFilter(item.country, country)
		);
		return order === 'name' ? found : found.sort(sortBy(order, shuffleSeed, (id) => activeRanks.get(id)));
	},
	/** Classement effectif d'une collection, de la meilleure fiche à la moins bonne. */
	ranking: rankingOf,
	/** Nouveau classement en cours, sans rapport avec les rangs affichés ; null s'il n'y en a pas. */
	rankingDraft: draftOf,
	/** Classement qui reçoit les duels : le nouveau s'il y en a un, sinon le classement actuel. */
	rankingTarget(collectionId: string): string[] {
		return draftOf(collectionId) ?? rankingOf(collectionId);
	},
	/** Rang dans sa collection ; undefined si la fiche n'est pas classée. */
	rankOf(item: ListItem): number | undefined {
		if (item.collectionId === active?.id) return activeRanks.get(item.id);
		const rank = rankingOf(item.collectionId).indexOf(item.id) + 1;
		return rank || undefined;
	},
	/** Fiches avec image pas encore classées, dans le classement qui reçoit les duels. */
	unranked(collectionId: string): ListItem[] {
		const ranked = new Set(entries.rankingTarget(collectionId));
		return inCollection(collectionId).filter((item) => isRankable(item) && !ranked.has(item.id));
	},
	/** Fiche de la collection déjà nommée ainsi ; undefined si le nom est libre ou si rien n'est chargé. */
	sameName(collectionId: string, name: string, exceptId?: string): ListItem | undefined {
		return findSameName(liveItems ?? [], collectionId, name, exceptId);
	},
	find(id: string): ListItem | undefined {
		return liveItems?.find((item) => item.id === id);
	},
	/** Fiches de sa collection, par nom : navigation d'une fiche ouverte sans passer par une liste. Cachées selon la préférence. */
	siblings(entry: ListItem): ListItem[] {
		return inCollection(entry.collectionId).filter((item) => prefs.showHidden || !item.hidden || item.id === entry.id);
	},
	/**
	 * Tags connus d'une fiche : ceux de sa collection (les identifiants de tags supprimés sont ignorés),
	 * dans l'ordre des catégories puis par nom.
	 */
	tagsOf(entry: { collectionId: string; tagIds?: string[] }): Tag[] {
		const own = entries.tagsIn(entry.collectionId).filter((tag) => entry.tagIds?.includes(tag.id));
		return groupTags(own, entries.tagGroupsIn(entry.collectionId)).flatMap((section) => section.tags);
	},
	sitesIn(collectionId: string): Site[] {
		return data.collections?.find((c) => c.id === collectionId)?.sites ?? [];
	},
	/** Catégories de tags d'une collection, dans l'ordre choisi. */
	tagGroupsIn(collectionId: string): TagGroup[] {
		return data.collections?.find((c) => c.id === collectionId)?.tagGroups ?? [];
	},
	/** Liens à afficher : sites actifs de sa collection, puis liens saisis. */
	linksOf(entry: { collectionId: string } & Parameters<typeof entryLinks>[0]): Link[] {
		return entryLinks(entry, entries.sitesIn(entry.collectionId));
	},
	countWithTag(tagId: string): number {
		return (liveItems ?? []).filter((item) => item.tagIds?.includes(tagId)).length;
	},
	/** Pays des fiches (toutes collections), du plus fréquent au moins fréquent : proposés en premier à la saisie. */
	get usedCountries(): string[] {
		const counts = new Map<string, number>();
		for (const item of liveItems ?? []) if (item.country) counts.set(item.country, (counts.get(item.country) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code);
	},
	countIn(collectionId: string): number {
		return (liveItems ?? []).filter((item) => item.collectionId === collectionId).length;
	}
};

/** Charge fiches, collections et tags une seule fois par session déverrouillée. */
export function loadEntries(): Promise<void> {
	const { user, dek } = session;
	if (!user || !dek) return Promise.resolve();
	const unreadable: string[] = [];
	let damaged = false;
	const onDamaged = () => (damaged = true);
	loading ??= Promise.all([
		listEntries(user.uid, dek, (id) => unreadable.push(id)),
		collectionCatalog.getOrEmpty(user.uid, dek, onDamaged),
		tagCatalog.getOrEmpty(user.uid, dek, onDamaged)
	]).then(
		([list, collectionList, tagList]) => {
			if (session.dek !== dek) return;
			// Corbeille expirée : supprimée à l'ouverture. En cas d'échec, ce sera refait à la prochaine.
			const now = Date.now();
			const expired = list.filter((entry) => isTrashExpired(entry.deletedAt, now));
			if (expired.length) deleteEntries(user.uid, expired.map((entry) => entry.id)).catch(() => {});
			const kept = list.filter((entry) => !isTrashExpired(entry.deletedAt, now));
			data.items?.forEach(revoke); // relecture après une écriture refusée
			data.items = kept.map(withThumbUrl).sort(byName);
			unreadableIds = unreadable;
			catalogDamaged = damaged;
			data.collections = withRecoveredCollections(collectionList, kept);
			data.tags = tagList.sort(byName);
		},
		(error) => {
			loading = null; // permet de réessayer
			throw error;
		}
	);
	return loading;
}

/** Après une restauration : tout sera rechargé (et déchiffré) à la prochaine lecture. */
export function resetEntries(): void {
	clear();
}

export function upsertEntries(changed: EntrySummary[]): void {
	if (!data.items) return; // la liste sera chargée en entier plus tard
	const ids = new Set(changed.map((entry) => entry.id));
	data.items.filter((item) => ids.has(item.id)).forEach(revoke);
	data.items = [...data.items.filter((item) => !ids.has(item.id)), ...changed.map(withThumbUrl)].sort(byName);
}

export const upsertEntry = (entry: EntrySummary): void => upsertEntries([entry]);

/**
 * Supprime fiches, images, collections et tags ; le compte et son trousseau restent. Retourne le nombre de fiches.
 * Catalogues en dernier : après une interruption, il suffit de relancer.
 */
export async function deleteAllData(password: string): Promise<number> {
	const { uid } = unlocked();
	await verifyPassword(password);
	const removed = await deleteStoredEntriesExcept(uid, new Set());
	await deleteRemainingImages(uid);
	await Promise.all([collectionCatalog.remove(uid), tagCatalog.remove(uid)]);
	clear();
	return removed;
}

export function removeEntry(id: string): void {
	if (!data.items) return;
	revoke(data.items.find((item) => item.id === id));
	data.items = data.items.filter((item) => item.id !== id);
}

/** Applique une modification à plusieurs fiches. Après un échec partiel, tout est relu depuis Firestore. */
async function patchEntries(targets: ListItem[], patch: (entry: ListItem) => Partial<EntryData>): Promise<void> {
	const { uid, dek } = unlocked();
	try {
		const updated = new Map((await patchStoredEntries(uid, dek, targets, patch)).map((entry) => [entry.id, entry]));
		data.items = (data.items ?? []).map((item) => updated.get(item.id) ?? item).sort(byName);
	} catch (error) {
		clear();
		loadEntries().catch(() => {});
		throw error;
	}
}

/**
 * Applique un import vérifié (`planImport`) : créations puis mises à jour, par lots.
 * Un échec en cours de route peut laisser des lots écrits : la liste est relue, sinon relancer l'import
 * recréerait en double les fiches déjà créées.
 */
export async function importEntries(collectionId: string, plan: ImportPlan): Promise<void> {
	const { uid, dek } = unlocked();
	if (plan.added.length) {
		const drafts = plan.added.map(({ name, fields }) => ({ name, ...fields }));
		try {
			upsertEntries(await createEntries(uid, dek, collectionId, drafts));
		} catch (error) {
			clear();
			loadEntries().catch(() => {});
			throw error;
		}
	}
	const fields = new Map(plan.updated.map((row) => [row.id, row.fields]));
	const targets = (liveItems ?? []).filter((item) => fields.has(item.id));
	if (targets.length) await patchEntries(targets, (entry) => ({ ...fields.get(entry.id), updatedAt: Date.now() }));
}

export const trashEntries = (targets: ListItem[]): Promise<void> =>
	patchEntries(targets, () => ({ deletedAt: Date.now() }));

/**
 * Sort de la corbeille. Un nom repris entre-temps dans la collection reçoit la date et l'heure de restauration ;
 * renvoie les nouveaux noms.
 */
export async function restoreFromTrash(targets: ListItem[]): Promise<string[]> {
	const now = new Date();
	const taken: Pick<ListItem, 'id' | 'name' | 'collectionId'>[] = [...(liveItems ?? [])];
	const renamed = new Map<string, string>();
	for (const entry of targets) {
		const name = findSameName(taken, entry.collectionId, entry.name) ? restoredName(entry.name, now) : entry.name;
		if (name !== entry.name) renamed.set(entry.id, name);
		taken.push({ ...entry, name });
	}
	await patchEntries(targets, (entry) => {
		const name = renamed.get(entry.id);
		return { deletedAt: undefined, ...(name && { name, updatedAt: now.getTime() }) };
	});
	return [...renamed.values()];
}

export const setEntriesHidden = (targets: ListItem[], hidden: boolean): Promise<void> =>
	patchEntries(targets, () => ({ hidden: hidden || undefined }));

/**
 * Affiche ou masque ces sites de la collection sur les fiches, sans toucher aux autres sites ;
 * `set` : seuls ces sites restent affichés, tous les autres sont masqués.
 */
export function changeEntriesSites(targets: ListItem[], siteIds: string[], mode: 'show' | 'hide' | 'set'): Promise<void> {
	return patchEntries(targets, (entry) => {
		const visible = (id: string) => (siteIds.includes(id) ? mode !== 'hide' : mode === 'set' ? false : undefined);
		return { ...withSiteVisibility(entry, entries.sitesIn(entry.collectionId), visible), updatedAt: Date.now() };
	});
}

/** Note depuis la fiche, sans passer par le formulaire ; undefined l'efface. */
export const rateEntry = (entry: ListItem, rating: number | undefined): Promise<void> =>
	patchEntries([entry], () => ({ rating: parseRating(rating), updatedAt: Date.now() }));

/** Ajoute ou retire ces tags, sans toucher aux autres tags des fiches ; `set` : les fiches ont exactement ces tags. */
export function changeEntriesTags(targets: ListItem[], tagIds: string[], mode: 'add' | 'remove' | 'set'): Promise<void> {
	return patchEntries(targets, (entry) => {
		const current = entry.tagIds ?? [];
		const next =
			mode === 'set'
				? [...tagIds]
				: mode === 'add'
					? [...new Set([...current, ...tagIds])]
					: current.filter((id) => !tagIds.includes(id));
		return { tagIds: next.length ? next : undefined, updatedAt: Date.now() };
	});
}

const THUMBS_PER_WRITE = 25;

/**
 * Refait les miniatures trop petites depuis les images stockées : une lecture et une écriture par fiche concernée.
 * Écrit par petits lots : après une interruption, relancer ne reprend que ce qui reste.
 */
export async function regenerateThumbs(onProgress: (done: number, total: number) => void): Promise<{ updated: number; failed: number }> {
	const { uid, dek } = unlocked();
	await loadEntries();
	const targets = (data.items ?? []).filter((item) => item.imageType);
	let done = 0;
	let updated = 0;
	let failed = 0;
	let pending: (ListItem & { thumb: Bytes })[] = [];

	async function flush() {
		await saveThumbs(uid, dek, pending);
		upsertEntries(pending);
		updated += pending.length;
		pending = [];
	}

	for (const item of targets) {
		const type = item.imageType!;
		if (!(item.thumb && (await isFullSizeThumb(item.thumb, type).catch(() => false)))) {
			const image = await getImage(uid, dek, item.id).catch(() => null);
			const thumb = image && (await rebuildThumb(image, type).catch(() => null));
			if (thumb) pending.push({ ...item, thumb });
			else failed++;
			if (pending.length === THUMBS_PER_WRITE) await flush();
		}
		onProgress(++done, targets.length);
	}
	if (pending.length) await flush();
	return { updated, failed };
}

/** Suppression définitive depuis la corbeille, images comprises. */
export async function deleteForever(targets: ListItem[]): Promise<void> {
	const { uid } = unlocked();
	await deleteEntries(uid, targets.map((entry) => entry.id));
	targets.forEach((entry) => removeEntry(entry.id));
}

/**
 * Retire les fiches illisibles, avec leurs images. Le mot de passe écarte le cas d'une DEK périmée (compte qui a
 * adopté une sauvegarde sur un autre appareil) : toutes les fiches y paraîtraient illisibles.
 */
export async function deleteUnreadableEntries(password: string): Promise<void> {
	const { uid } = unlocked();
	await verifyPassword(password);
	await Promise.all(unreadableIds.map((id) => deleteEntry(uid, id)));
	unreadableIds = [];
}

/** La session doit être déverrouillée ; utilisé aussi par collections.ts et ranking.ts. */
export function unlocked() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	return { uid: user.uid, dek };
}

/** Chaque catalogue est réécrit en entier : il doit être chargé, sinon on l'écraserait. */
export function loaded<T>(catalog: T[] | null): T[] {
	if (!catalog) throw new Error('Catalogue pas encore chargé.');
	return catalog;
}

/** Nouvel ordre pour le tri aléatoire. */
export function reshuffle(): void {
	shuffleSeed = Math.random();
}
