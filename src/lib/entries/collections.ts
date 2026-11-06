/**
 * Collections, leurs sites, leurs tags et leurs catégories de tags : catalogues chiffrés, réécrits en entier à chaque modification.
 * L'état en mémoire est celui du store (`data`), vidé avec lui au verrouillage.
 */
import { prefs } from '$lib/prefs.svelte';
import { collectionCatalog, tagCatalog } from './catalog';
import {
	type BorderColor,
	type Collection,
	type Site,
	type SiteMode,
	type FilterLevel,
	type Tag,
	type TagGroup,
	byName,
	effectiveGroupId,
	moveItem,
	parseLabel,
	parseSiteTemplate,
	planTagGroups,
	withFilterLevel,
	withDiscovered,
	withSiteMode
} from './model';
import { data, entries, loaded, unlocked } from './store.svelte';

export function selectCollection(id: string): void {
	prefs.collectionId = id;
}

export async function replaceCollections(next: Collection[]): Promise<void> {
	const { uid, dek } = unlocked();
	await collectionCatalog.save(uid, dek, next);
	data.collections = next;
}

/** Ajoutée en fin de liste ; la toute première devient la collection active. */
export async function addCollection(input: string): Promise<void> {
	const current = loaded(data.collections);
	const created = { id: crypto.randomUUID(), name: parseLabel(input, current) };
	await replaceCollections([...current, created]);
	if (current.length === 0) selectCollection(created.id);
}

export async function renameCollection(id: string, input: string): Promise<void> {
	const current = loaded(data.collections);
	const name = parseLabel(input, current.filter((c) => c.id !== id));
	await replaceCollections(current.map((c) => (c.id === id ? { ...c, name } : c)));
}

export async function moveCollection(id: string, delta: -1 | 1): Promise<void> {
	const current = loaded(data.collections);
	const next = moveItem(current, current.findIndex((c) => c.id === id), delta);
	if (next !== current) await replaceCollections(next);
}

/** Album : la fiche tirée devient découverte (voir album.ts). `ids` : les fiches de la collection. */
export async function discoverInAlbum(collectionId: string, id: string, ids: string[]): Promise<void> {
	const current = loaded(data.collections);
	await replaceCollections(current.map((c) => (c.id === collectionId ? { ...c, discovered: withDiscovered(c.discovered, id, ids) } : c)));
}

/** Album : toutes les cartes repartent face cachée. */
export async function resetAlbum(collectionId: string): Promise<void> {
	const current = loaded(data.collections);
	await replaceCollections(current.map((c) => (c.id === collectionId ? { ...c, discovered: undefined } : c)));
}

/** Au moins une collection reste visible : la liste a toujours une collection active à montrer. */
export async function setCollectionHidden(id: string, hidden: boolean): Promise<void> {
	const current = loaded(data.collections);
	if (hidden && !current.some((c) => c.id !== id && !c.hidden)) throw new Error('Au moins une collection doit rester visible.');
	await replaceCollections(current.map((c) => (c.id === id ? { ...c, hidden: hidden || undefined } : c)));
}

/** Uniquement vide : aucune fiche ne peut perdre sa collection. Ses tags disparaissent avec elle. */
export async function deleteCollection(id: string): Promise<void> {
	const count = entries.countIn(id);
	if (count) throw new Error(`Cette collection contient encore ${count} fiche${count > 1 ? 's' : ''}.`);
	const currentTags = loaded(data.tags);
	await replaceCollections(loaded(data.collections).filter((c) => c.id !== id));
	// Écrit après les collections : en cas d'échec, des tags orphelins restent, invisibles et sans effet.
	if (currentTags.some((tag) => tag.collectionId === id))
		await replaceTags(currentTags.filter((tag) => tag.collectionId !== id));
}

const replaceSites = (collectionId: string, sites: Site[]): Promise<void> =>
	replaceCollections(loaded(data.collections).map((c) => (c.id === collectionId ? { ...c, sites } : c)));

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

export const setSiteMode = (collectionId: string, id: string, mode: SiteMode): Promise<void> =>
	replaceSites(
		collectionId,
		entries.sitesIn(collectionId).map((site) => (site.id === id ? withSiteMode(site, mode) : site))
	);

/** Les termes propres des fiches sont oubliés à leur prochaine modification, comme les tags supprimés. */
export const deleteSite = (collectionId: string, id: string): Promise<void> =>
	replaceSites(collectionId, entries.sitesIn(collectionId).filter((site) => site.id !== id));

const replaceTagGroups = (collectionId: string, tagGroups: TagGroup[]): Promise<void> =>
	replaceCollections(loaded(data.collections).map((c) => (c.id === collectionId ? { ...c, tagGroups } : c)));

/** Une catégorie par ligne, avec ses tags éventuels (voir `planTagGroups`) : les catégories d'abord, les tags ensuite. */
export async function addTagGroups(collectionId: string, text: string): Promise<void> {
	const all = loaded(data.tags);
	const own = all.filter((tag) => tag.collectionId === collectionId);
	const plan = planTagGroups(text, entries.tagGroupsIn(collectionId), own, collectionId, () => crypto.randomUUID());
	await replaceTagGroups(collectionId, plan.groups);
	if (plan.tags.length !== own.length || plan.tags.some((tag, i) => tag !== own[i]))
		await replaceTags([...all.filter((tag) => tag.collectionId !== collectionId), ...plan.tags]);
}

export async function renameTagGroup(collectionId: string, id: string, input: string): Promise<void> {
	const groups = entries.tagGroupsIn(collectionId);
	const name = parseLabel(input, groups.filter((group) => group.id !== id));
	await replaceTagGroups(collectionId, groups.map((group) => (group.id === id ? { ...group, name } : group)));
}

export async function moveTagGroup(collectionId: string, id: string, delta: -1 | 1): Promise<void> {
	const groups = entries.tagGroupsIn(collectionId);
	const next = moveItem(groups, groups.findIndex((group) => group.id === id), delta);
	if (next !== groups) await replaceTagGroups(collectionId, next);
}

export async function setTagGroupFilter(collectionId: string, id: string, level: FilterLevel): Promise<void> {
	const groups = entries.tagGroupsIn(collectionId);
	await replaceTagGroups(
		collectionId,
		groups.map((group) => (group.id === id ? withFilterLevel(group, level) : group))
	);
}

/** Catégorie qui donne la bordure des cartes ; une seule par collection, cocher l'une décoche l'autre. */
export async function setTagGroupBorder(collectionId: string, id: string, border: boolean): Promise<void> {
	const groups = entries.tagGroupsIn(collectionId);
	await replaceTagGroups(
		collectionId,
		groups.map((group) => {
			const { border: _, ...rest } = group;
			return border && group.id === id ? { ...rest, border: true } : rest;
		})
	);
}

/** Couleur de bordure d'un tag ; undefined la retire. */
export async function setTagColor(id: string, color: BorderColor | undefined): Promise<void> {
	await replaceTags(
		loaded(data.tags).map((tag) => {
			if (tag.id !== id) return tag;
			const { color: _, ...rest } = tag;
			return color ? { ...rest, color } : rest;
		})
	);
}

/** Ses tags restent, sans catégorie : leur `groupId` devenu inconnu est ignoré (voir `groupTags`). */
export const deleteTagGroup = (collectionId: string, id: string): Promise<void> =>
	replaceTagGroups(collectionId, entries.tagGroupsIn(collectionId).filter((group) => group.id !== id));

/** Toutes les catégories de la collection ; leurs tags restent, sans catégorie. */
export const deleteAllTagGroups = (collectionId: string): Promise<void> => replaceTagGroups(collectionId, []);

async function replaceTags(next: Tag[]): Promise<void> {
	const { uid, dek } = unlocked();
	await tagCatalog.save(uid, dek, next);
	data.tags = [...next].sort(byName);
}

/** Tags de la même catégorie effective (`undefined` : sans catégorie), parmi lesquels un nom doit être unique. */
function sameGroup(collectionId: string, groupId: string | undefined, exceptId?: string): Tag[] {
	const groups = entries.tagGroupsIn(collectionId);
	return loaded(data.tags).filter(
		(tag) => tag.collectionId === collectionId && tag.id !== exceptId && effectiveGroupId(tag, groups) === groupId
	);
}

/** Dans la collection active ; un même nom peut exister dans deux collections, ou dans deux catégories. */
export async function addTag(input: string, groupId?: string): Promise<void> {
	const current = loaded(data.tags);
	const active = entries.active;
	if (!active) throw new Error('Aucune collection.');
	const collectionId = active.id;
	const name = parseLabel(input, sameGroup(collectionId, groupId));
	await replaceTags([...current, { id: crypto.randomUUID(), name, collectionId, ...(groupId && { groupId }) }]);
}

/** `undefined` : sans catégorie. Refusé si la catégorie a déjà un tag de ce nom. */
export async function setTagGroup(id: string, groupId: string | undefined): Promise<void> {
	const current = loaded(data.tags);
	const tag = current.find((t) => t.id === id);
	if (!tag) return;
	parseLabel(tag.name, sameGroup(tag.collectionId, groupId, id));
	await replaceTags(
		current.map((t) => {
			if (t.id !== id) return t;
			const { groupId: _, ...rest } = t;
			return groupId ? { ...rest, groupId } : rest;
		})
	);
}

/** Place du tag dans le filtre de la liste, à l'intérieur de sa catégorie. */
export async function setTagFilter(id: string, level: FilterLevel): Promise<void> {
	await replaceTags(loaded(data.tags).map((tag) => (tag.id === id ? withFilterLevel(tag, level) : tag)));
}

/** Les fiches ne stockent que l'identifiant : renommer ne touche que le catalogue. */
export async function renameTag(id: string, input: string): Promise<void> {
	const current = loaded(data.tags);
	const tag = current.find((t) => t.id === id);
	if (!tag) return;
	const groupId = effectiveGroupId(tag, entries.tagGroupsIn(tag.collectionId));
	const name = parseLabel(input, sameGroup(tag.collectionId, groupId, id));
	await replaceTags(current.map((t) => (t.id === id ? { ...t, name } : t)));
}

/** Retire le tag du catalogue ; les fiches qui le portent l'oublient à leur prochaine modification. */
export async function deleteTag(id: string): Promise<void> {
	await replaceTags(loaded(data.tags).filter((tag) => tag.id !== id));
}

/** Tous les tags de la collection, comme `deleteTag` pour chacun. */
export async function deleteAllTags(collectionId: string): Promise<void> {
	await replaceTags(loaded(data.tags).filter((tag) => tag.collectionId !== collectionId));
}
