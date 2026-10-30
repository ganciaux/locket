/**
 * Fiches, collections et tags déchiffrés en mémoire, chargés une fois après le déverrouillage puis tenus à jour localement.
 * Vidés dès que la session est verrouillée : rien de déchiffré ne survit à la DEK.
 * La liste, la recherche et les tags proposés sont ceux de la collection active (préférence propre à l'appareil).
 */
import { verifyPassword } from '$lib/auth/account';
import { session } from '$lib/auth/session.svelte';
import { prefs } from '$lib/prefs.svelte';
import { collectionCatalog, tagCatalog } from './catalog';
import { bytesToUrl } from './images';
import {
	NO_TAG_FILTER,
	type Collection,
	type EntryData,
	type Link,
	type Site,
	type SortOrder,
	type Tag,
	type TagFilter,
	byName,
	entryLinks,
	findSameName,
	restoredName,
	isTrashExpired,
	type CountryFilter,
	type RatingFilter,
	matchesCountryFilter,
	matchesFilter,
	matchesLinkFilter,
	matchesRatingFilter,
	parseRating,
	moveItem,
	parseLabel,
	parseSiteTemplate,
	sortBy,
	withRecoveredCollections
} from './model';
import {
	deleteEntries,
	deleteEntry,
	deleteRemainingImages,
	deleteStoredEntriesExcept,
	listEntries,
	patchStoredEntries,
	type EntrySummary
} from './repository';

export type ListItem = EntrySummary & { thumbUrl?: string };

let items = $state.raw<ListItem[] | null>(null);
let tags = $state.raw<Tag[] | null>(null);
let collections = $state.raw<Collection[] | null>(null);
let unreadableIds = $state.raw<string[]>([]);
let catalogDamaged = $state(false);
// Graine du tri aléatoire : fixée pour la session, l'ordre ne change pas à chaque retour sur la liste.
let shuffleSeed = $state(Math.random());
let loading: Promise<void> | null = null;

const tagNames = $derived(new Map((tags ?? []).map((tag) => [tag.id, tag.name])));
// Collection choisie sur cet appareil ; si elle n'existe plus (ou jamais choisie), la première.
const active = $derived(collections && (collections.find((c) => c.id === prefs.collectionId) ?? collections[0] ?? null));
// La corbeille reste chargée, mais hors de tout ce qui s'affiche ou se compte.
const liveItems = $derived(items && items.filter((item) => !item.deletedAt));
const activeItems = $derived(liveItems && liveItems.filter((item) => item.collectionId === active?.id));
const activeTags = $derived(tags && tags.filter((tag) => tag.collectionId === active?.id));

const withThumbUrl = (entry: EntrySummary): ListItem => ({
	...entry,
	thumbUrl: entry.thumb && entry.imageType ? bytesToUrl(entry.thumb, entry.imageType) : undefined
});

const revoke = (item: ListItem | undefined) => item?.thumbUrl && URL.revokeObjectURL(item.thumbUrl);

function clear() {
	items?.forEach(revoke);
	items = null;
	tags = null;
	collections = null;
	unreadableIds = [];
	catalogDamaged = false;
	loading = null;
}

$effect.root(() => {
	$effect(() => {
		if (!session.dek) clear();
	});
});

export const entries = {
	/** Toutes les fiches, toutes collections confondues (pour retrouver une fiche par son id). */
	get items() {
		return items;
	},
	/** Fiches de la collection active, triées par nom. */
	get activeItems() {
		return activeItems;
	},
	/** Dans l'ordre choisi par l'utilisateur. */
	get collections() {
		return collections;
	},
	/** null tant que rien n'est chargé, ou si aucune collection n'existe encore. */
	get active() {
		return active;
	},
	/** Tags de la collection active, triés par nom. */
	get tags() {
		return activeTags;
	},
	tagsIn(collectionId: string): Tag[] {
		return (tags ?? []).filter((tag) => tag.collectionId === collectionId);
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
		return (items ?? []).filter((item) => item.deletedAt).sort((a, b) => b.deletedAt! - a.deletedAt!);
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
			country = '',
			order = 'name'
		}: { tags?: TagFilter; withLinks?: boolean; rating?: RatingFilter; country?: CountryFilter; order?: SortOrder } = {}
	): ListItem[] {
		const found = (activeItems ?? []).filter(
			(item) =>
				(prefs.showHidden || !item.hidden) &&
				matchesFilter(item, query, tags, tagNames) &&
				matchesLinkFilter(entries.linksOf(item).length, withLinks) &&
				matchesRatingFilter(item.rating, rating) &&
				matchesCountryFilter(item.country, country)
		);
		return order === 'name' ? found : found.sort(sortBy(order, shuffleSeed));
	},
	/** Fiche de la collection déjà nommée ainsi ; undefined si le nom est libre ou si rien n'est chargé. */
	sameName(collectionId: string, name: string, exceptId?: string): ListItem | undefined {
		return findSameName(liveItems ?? [], collectionId, name, exceptId);
	},
	find(id: string): ListItem | undefined {
		return liveItems?.find((item) => item.id === id);
	},
	/** Tags connus d'une fiche : ceux de sa collection (les identifiants de tags supprimés sont ignorés). */
	tagsOf(entry: { collectionId: string; tagIds?: string[] }): Tag[] {
		return entries.tagsIn(entry.collectionId).filter((tag) => entry.tagIds?.includes(tag.id));
	},
	sitesIn(collectionId: string): Site[] {
		return collections?.find((c) => c.id === collectionId)?.sites ?? [];
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
			items = kept.map(withThumbUrl).sort(byName);
			unreadableIds = unreadable;
			catalogDamaged = damaged;
			collections = withRecoveredCollections(collectionList, kept);
			tags = tagList.sort(byName);
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
	if (!items) return; // la liste sera chargée en entier plus tard
	const ids = new Set(changed.map((entry) => entry.id));
	items.filter((item) => ids.has(item.id)).forEach(revoke);
	items = [...items.filter((item) => !ids.has(item.id)), ...changed.map(withThumbUrl)].sort(byName);
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
	if (!items) return;
	revoke(items.find((item) => item.id === id));
	items = items.filter((item) => item.id !== id);
}

/** Applique une modification à plusieurs fiches. Après un échec partiel, tout est relu depuis Firestore. */
async function patchEntries(targets: ListItem[], patch: (entry: ListItem) => Partial<EntryData>): Promise<void> {
	const { uid, dek } = unlocked();
	try {
		const updated = new Map((await patchStoredEntries(uid, dek, targets, patch)).map((entry) => [entry.id, entry]));
		items = (items ?? []).map((item) => updated.get(item.id) ?? item).sort(byName);
	} catch (error) {
		clear();
		loadEntries().catch(() => {});
		throw error;
	}
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
		const current = entry.hiddenSites ?? [];
		const next =
			mode === 'set'
				? entries.sitesIn(entry.collectionId).map((site) => site.id).filter((id) => !siteIds.includes(id))
				: mode === 'hide'
					? [...new Set([...current, ...siteIds])]
					: current.filter((id) => !siteIds.includes(id));
		return { hiddenSites: next.length ? next : undefined, updatedAt: Date.now() };
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

// ---------------------------------------------------------------------------
// Administration. Chaque catalogue est réécrit en entier : il doit être chargé, sinon on l'écraserait.

function unlocked() {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	return { uid: user.uid, dek };
}

function loaded<T>(catalog: T[] | null): T[] {
	if (!catalog) throw new Error('Catalogue pas encore chargé.');
	return catalog;
}

/** Nouvel ordre pour le tri aléatoire. */
export function reshuffle(): void {
	shuffleSeed = Math.random();
}

export function selectCollection(id: string): void {
	prefs.collectionId = id;
}

async function replaceCollections(next: Collection[]): Promise<void> {
	const { uid, dek } = unlocked();
	await collectionCatalog.save(uid, dek, next);
	collections = next;
}

/** Ajoutée en fin de liste ; la toute première devient la collection active. */
export async function addCollection(input: string): Promise<void> {
	const current = loaded(collections);
	const created = { id: crypto.randomUUID(), name: parseLabel(input, current) };
	await replaceCollections([...current, created]);
	if (current.length === 0) selectCollection(created.id);
}

export async function renameCollection(id: string, input: string): Promise<void> {
	const current = loaded(collections);
	const name = parseLabel(input, current.filter((c) => c.id !== id));
	await replaceCollections(current.map((c) => (c.id === id ? { ...c, name } : c)));
}

export async function moveCollection(id: string, delta: -1 | 1): Promise<void> {
	const current = loaded(collections);
	const next = moveItem(current, current.findIndex((c) => c.id === id), delta);
	if (next !== current) await replaceCollections(next);
}

/** Uniquement vide : aucune fiche ne peut perdre sa collection. Ses tags disparaissent avec elle. */
export async function deleteCollection(id: string): Promise<void> {
	const count = entries.countIn(id);
	if (count) throw new Error(`Cette collection contient encore ${count} fiche${count > 1 ? 's' : ''}.`);
	const currentTags = loaded(tags);
	await replaceCollections(loaded(collections).filter((c) => c.id !== id));
	// Écrit après les collections : en cas d'échec, des tags orphelins restent, invisibles et sans effet.
	if (currentTags.some((tag) => tag.collectionId === id))
		await replaceTags(currentTags.filter((tag) => tag.collectionId !== id));
}

const replaceSites = (collectionId: string, sites: Site[]): Promise<void> =>
	replaceCollections(loaded(collections).map((c) => (c.id === collectionId ? { ...c, sites } : c)));

/** Crée un site (actif) ou modifie celui d'identifiant `id`. */
export async function saveSite(collectionId: string, input: { label: string; urlTemplate: string }, id?: string): Promise<void> {
	const sites = entries.sitesIn(collectionId);
	const others = sites.filter((site) => site.id !== id).map((site) => ({ name: site.label }));
	const label = parseLabel(input.label, others);
	const urlTemplate = parseSiteTemplate(input.urlTemplate);
	await replaceSites(
		collectionId,
		id
			? sites.map((site) => (site.id === id ? { ...site, label, urlTemplate } : site))
			: [...sites, { id: crypto.randomUUID(), label, urlTemplate, enabled: true }]
	);
}

export async function moveSite(collectionId: string, id: string, delta: -1 | 1): Promise<void> {
	const sites = entries.sitesIn(collectionId);
	const next = moveItem(sites, sites.findIndex((site) => site.id === id), delta);
	if (next !== sites) await replaceSites(collectionId, next);
}

export const toggleSite = (collectionId: string, id: string): Promise<void> =>
	replaceSites(
		collectionId,
		entries.sitesIn(collectionId).map((site) => (site.id === id ? { ...site, enabled: !site.enabled } : site))
	);

/** Les termes propres des fiches sont oubliés à leur prochaine modification, comme les tags supprimés. */
export const deleteSite = (collectionId: string, id: string): Promise<void> =>
	replaceSites(collectionId, entries.sitesIn(collectionId).filter((site) => site.id !== id));

async function replaceTags(next: Tag[]): Promise<void> {
	const { uid, dek } = unlocked();
	await tagCatalog.save(uid, dek, next);
	tags = [...next].sort(byName);
}

/** Dans la collection active ; un même nom peut exister dans deux collections. */
export async function addTag(input: string): Promise<void> {
	const current = loaded(tags);
	if (!active) throw new Error('Aucune collection.');
	const collectionId = active.id;
	const name = parseLabel(input, current.filter((tag) => tag.collectionId === collectionId));
	await replaceTags([...current, { id: crypto.randomUUID(), name, collectionId }]);
}

/** Les fiches ne stockent que l'identifiant : renommer ne touche que le catalogue. */
export async function renameTag(id: string, input: string): Promise<void> {
	const current = loaded(tags);
	const tag = current.find((t) => t.id === id);
	if (!tag) return;
	const name = parseLabel(input, current.filter((t) => t.collectionId === tag.collectionId && t.id !== id));
	await replaceTags(current.map((t) => (t.id === id ? { ...t, name } : t)));
}

/** Retire le tag du catalogue ; les fiches qui le portent l'oublient à leur prochaine modification. */
export async function deleteTag(id: string): Promise<void> {
	await replaceTags(loaded(tags).filter((tag) => tag.id !== id));
}
