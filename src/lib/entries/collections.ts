/**
 * Collections, leurs sites, leurs tags et leurs catégories de tags : catalogues chiffrés, réécrits en entier à chaque modification.
 * L'état en mémoire est celui du store (`data`), vidé avec lui au verrouillage.
 */
import { prefs } from '$lib/prefs.svelte';
import { collectionCatalog, tagCatalog } from './catalog';
import {
	type Collection,
	type Site,
	type SiteMode,
	type FilterLevel,
	type Tag,
	type TagGroup,
	byName,
	moveItem,
	parseGroupInput,
	parseLabel,
	parseSiteTemplate,
	searchKey,
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

/**
 * Ajoutée en fin de liste. « Genre = Action, Drame » crée aussi ses tags ; un tag du même nom déjà dans la collection
 * y est rangé. Tout est validé avant d'écrire ; la catégorie d'abord, ses tags ensuite.
 */
export async function addTagGroup(collectionId: string, input: string): Promise<void> {
	const groups = entries.tagGroupsIn(collectionId);
	const parsed = parseGroupInput(input);
	const group = { id: crypto.randomUUID(), name: parseLabel(parsed.name, groups) };
	const current = loaded(data.tags);
	const existing = new Map(
		current.filter((tag) => tag.collectionId === collectionId).map((tag) => [searchKey(tag.name), tag.id])
	);
	const moved = new Set<string>();
	const created: Tag[] = [];
	for (const name of parsed.tags) {
		const id = existing.get(searchKey(name));
		if (id) moved.add(id);
		else created.push({ id: crypto.randomUUID(), name: parseLabel(name, []), collectionId, groupId: group.id });
	}
	await replaceTagGroups(collectionId, [...groups, group]);
	if (moved.size || created.length)
		await replaceTags([
			...current.map((tag) => (moved.has(tag.id) ? { ...tag, groupId: group.id } : tag)),
			...created
		]);
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
		groups.map((group) => {
			if (group.id !== id) return group;
			const { filter: _, ...rest } = group;
			return level === 'simple' ? rest : { ...rest, filter: level };
		})
	);
}

/** Ses tags restent, sans catégorie : leur `groupId` devenu inconnu est ignoré (voir `groupTags`). */
export const deleteTagGroup = (collectionId: string, id: string): Promise<void> =>
	replaceTagGroups(collectionId, entries.tagGroupsIn(collectionId).filter((group) => group.id !== id));

async function replaceTags(next: Tag[]): Promise<void> {
	const { uid, dek } = unlocked();
	await tagCatalog.save(uid, dek, next);
	data.tags = [...next].sort(byName);
}

/** Dans la collection active ; un même nom peut exister dans deux collections. */
export async function addTag(input: string, groupId?: string): Promise<void> {
	const current = loaded(data.tags);
	const active = entries.active;
	if (!active) throw new Error('Aucune collection.');
	const collectionId = active.id;
	const name = parseLabel(input, current.filter((tag) => tag.collectionId === collectionId));
	await replaceTags([...current, { id: crypto.randomUUID(), name, collectionId, ...(groupId && { groupId }) }]);
}

/** `undefined` : sans catégorie. */
export async function setTagGroup(id: string, groupId: string | undefined): Promise<void> {
	await replaceTags(
		loaded(data.tags).map((tag) => {
			if (tag.id !== id) return tag;
			const { groupId: _, ...rest } = tag;
			return groupId ? { ...rest, groupId } : rest;
		})
	);
}

/** Les fiches ne stockent que l'identifiant : renommer ne touche que le catalogue. */
export async function renameTag(id: string, input: string): Promise<void> {
	const current = loaded(data.tags);
	const tag = current.find((t) => t.id === id);
	if (!tag) return;
	const name = parseLabel(input, current.filter((t) => t.collectionId === tag.collectionId && t.id !== id));
	await replaceTags(current.map((t) => (t.id === id ? { ...t, name } : t)));
}

/** Retire le tag du catalogue ; les fiches qui le portent l'oublient à leur prochaine modification. */
export async function deleteTag(id: string): Promise<void> {
	await replaceTags(loaded(data.tags).filter((tag) => tag.id !== id));
}
