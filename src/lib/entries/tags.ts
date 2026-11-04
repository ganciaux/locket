/** Tags et catégories : rangement, niveaux de filtre, filtre de la liste, saisie groupée, file du Tagger. */
import { matchesSearch, parseLabel, searchKey } from './text';
import { type Tag, type TagGroup } from './types';

/**
 * Catégorie effective d'un tag : la sienne si elle existe encore, sinon aucune (catégorie supprimée).
 * Un nom de tag est unique dans sa catégorie : « Action » peut exister dans Genre et dans Thème.
 */
export const effectiveGroupId = (tag: Tag, groups: TagGroup[]): string | undefined =>
	tag.groupId && groups.some((group) => group.id === tag.groupId) ? tag.groupId : undefined;

/** Recherche simple (toujours proposée), avancée (sur demande) ou hors filtre. */
export type FilterLevel = 'simple' | 'advanced' | 'off';

export const FILTER_LEVELS: { value: FilterLevel; label: string }[] = [
	{ value: 'simple', label: 'Recherche simple' },
	{ value: 'advanced', label: 'Recherche avancée' },
	{ value: 'off', label: 'Hors filtre' }
];

/** Niveau d'une catégorie ou d'un tag ; « Autres » (tags sans catégorie) est en recherche simple. */
export const filterLevel = (item: Tag | TagGroup | null): FilterLevel => item?.filter ?? 'simple';

/** Catégorie ou tag proposé dans le filtre ; ce qui est coché reste visible, pour pouvoir le décocher. */
export const facetShown = (level: FilterLevel, extended: boolean, active: boolean): boolean =>
	active || level === 'simple' || (level === 'advanced' && extended);

/** Tags proposés dans le filtre de la liste (voir `facetShown`) ; l'ordre est conservé. */
export const filterableTags = (tags: Tag[], extended: boolean, selected: string[]): Tag[] =>
	tags.filter((tag) => facetShown(filterLevel(tag), extended, selected.includes(tag.id)));

/** Le bouton « Recherche avancée » n'a de sens que si une catégorie ou un tag est en recherche avancée. */
export const hasAdvancedFilter = (tags: Tag[], groups: TagGroup[]): boolean =>
	[...groups, ...tags].some((item) => filterLevel(item) === 'advanced');

/** Copie de la catégorie ou du tag au niveau donné ; « simple » retire le champ. */
export function withFilterLevel<T extends { filter?: 'advanced' | 'off' }>(item: T, level: FilterLevel): T {
	const { filter: _, ...rest } = item;
	return (level === 'simple' ? rest : { ...rest, filter: level }) as T;
}

/**
 * Tags par catégorie, dans l'ordre des catégories, sans les catégories vides ; ceux sans catégorie
 * (ou d'une catégorie supprimée) viennent en dernier, sous `group: null`. L'ordre des tags est conservé.
 */
export function groupTags(tags: Tag[], groups: TagGroup[]): { group: TagGroup | null; tags: Tag[] }[] {
	const known = new Set(groups.map((group) => group.id));
	const sections: { group: TagGroup | null; tags: Tag[] }[] = groups.map((group) => ({
		group,
		tags: tags.filter((tag) => tag.groupId === group.id)
	}));
	sections.push({ group: null, tags: tags.filter((tag) => !tag.groupId || !known.has(tag.groupId)) });
	return sections.filter((section) => section.tags.length);
}

/** Information à compléter sur une fiche : pays, naissance, image, ou une catégorie de tags (`group:<id>`). */
export type MissingField = 'country' | 'birthYear' | 'image' | `group:${string}`;

/**
 * Ce qui manque à une fiche : pays, année de naissance, image, puis chaque catégorie (ayant des tags) dont elle n'a
 * aucun tag. `tags` : ceux de sa collection. La note n'en fait pas partie : une fiche peut rester non notée.
 */
export function missingFields(
	entry: { country?: string; birthYear?: number; imageType?: string; tagIds?: string[] },
	tags: Tag[],
	groups: TagGroup[]
): MissingField[] {
	const fields: MissingField[] = [];
	if (!entry.country) fields.push('country');
	if (!entry.birthYear) fields.push('birthYear');
	if (!entry.imageType) fields.push('image');
	for (const { group, tags: groupTagList } of groupTags(tags, groups))
		if (group && !groupTagList.some((tag) => entry.tagIds?.includes(tag.id))) fields.push(`group:${group.id}`);
	return fields;
}

const MISSING_LABELS: Record<string, string> = { country: 'pays', birthYear: 'naissance', image: 'image' };

export const missingLabel = (field: MissingField, groups: TagGroup[]): string =>
	MISSING_LABELS[field] ?? groups.find((group) => `group:${group.id}` === field)?.name ?? field;

/**
 * Filtre par tags de la liste :
 *  - aucun tag sélectionné : pas de filtre ;
 *  - au moins un tag sélectionné de chaque catégorie concernée (OU dans une catégorie, ET entre catégories) ;
 *    les tags sans catégorie forment une catégorie à eux seuls ;
 *  - `missing` : catégories où « Non renseigné » est coché, comme un tag de plus de la catégorie
 *    (vrai pour une fiche qui n'a aucun tag de cette catégorie) ;
 *  - `untagged` : uniquement les fiches sans tag (exclusif des autres choix).
 */
export type TagFilter = { tagIds: string[]; missing: string[]; untagged: boolean };

export const NO_TAG_FILTER: TagFilter = { tagIds: [], missing: [], untagged: false };

/**
 * Filtre actif en clair, un morceau par critère (les morceaux se lisent reliés par « et », les valeurs d'un critère
 * par « ou », comme `matchesFilter`) : « Avec liens », « Note : ★ 4 et plus », « Pays : France ou Japon »,
 * « Genre : Action ou Non renseigné », « Sans tag ». Les libellés de note et de pays sont fournis par la page.
 */
export function describeFilter(filter: {
	withLinks: boolean;
	rating?: string;
	countries: string[];
	tags: TagFilter;
	tagList: Tag[];
	groups: TagGroup[];
}): string[] {
	const parts: string[] = [];
	if (filter.withLinks) parts.push('Avec liens');
	if (filter.rating) parts.push(`Note : ${filter.rating}`);
	if (filter.countries.length) parts.push(`Pays : ${filter.countries.join(' ou ')}`);
	if (filter.tags.untagged) return [...parts, 'Sans tag'];
	for (const { group, tags } of groupTags(filter.tagList, filter.groups)) {
		const values = tags.filter((tag) => filter.tags.tagIds.includes(tag.id)).map((tag) => tag.name);
		if (group && filter.tags.missing.includes(group.id)) values.push('Non renseigné');
		if (values.length) parts.push(`${group?.name ?? 'Autres'} : ${values.join(' ou ')}`);
	}
	return parts;
}

/** Nom et catégorie (connue, '' sinon) d'un tag, pour la recherche et le filtre. */
export type TagIndex = Map<string, { name: string; group: string }>;

/** Le texte doit apparaître dans le nom ou dans l'un des tags ; les tags supprimés (inconnus) sont ignorés. */
export function matchesFilter(
	entry: { name: string; tagIds?: string[] },
	query: string,
	filter: TagFilter,
	tags: TagIndex
): boolean {
	const known = (entry.tagIds ?? []).filter((id) => tags.has(id));
	if (filter.untagged) {
		if (known.length) return false;
	} else {
		const wanted = Map.groupBy(
			filter.tagIds.filter((id) => tags.has(id)),
			(id) => tags.get(id)!.group
		);
		for (const group of filter.missing) if (!wanted.has(group)) wanted.set(group, []);
		const filled = new Set(known.map((id) => tags.get(id)!.group));
		for (const [group, ids] of wanted) {
			const missingOk = filter.missing.includes(group) && !filled.has(group);
			if (!missingOk && !ids.some((id) => known.includes(id))) return false;
		}
	}
	return matchesSearch(entry.name, query) || known.some((id) => matchesSearch(tags.get(id)!.name, query));
}

/**
 * Saisie d'une catégorie : « Genre » seule, ou « Genre = Action, Drame » avec ses tags (vides et doublons retirés,
 * sans casse ni accents). Les libellés sont validés ensuite par `parseLabel`.
 */
export function parseGroupInput(input: string): { name: string; tags: string[] } {
	const at = input.indexOf('=');
	if (at < 0) return { name: input, tags: [] };
	const tags = input
		.slice(at + 1)
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
	const keys = tags.map(searchKey);
	return { name: input.slice(0, at), tags: tags.filter((_, i) => keys.indexOf(keys[i]) === i) };
}

/**
 * Saisie de catégories, une par ligne (« Genre = Action, Drame ») : une catégorie inconnue est ajoutée en fin de liste,
 * une catégorie existante suivie de tags est complétée (on peut recoller une liste mise à jour). Un tag sans catégorie
 * du même nom y est rangé, un tag déjà dans la catégorie est ignoré, les autres sont créés. `tags` : ceux de la
 * collection. Lève une erreur affichable (avec le numéro de ligne s'il y en a plusieurs), avant toute écriture.
 */
export function planTagGroups(
	text: string,
	groups: TagGroup[],
	tags: Tag[],
	collectionId: string,
	newId: () => string
): { groups: TagGroup[]; tags: Tag[] } {
	const nextGroups = [...groups];
	let nextTags = [...tags];
	const lines = text.split(/\r?\n/);
	const filled = lines.filter((line) => line.trim()).length;
	if (!filled) throw new Error('Le nom ne peut pas être vide.');
	lines.forEach((line, i) => {
		if (!line.trim()) return;
		try {
			const parsed = parseGroupInput(line);
			const key = searchKey(parsed.name.trim());
			let group = parsed.tags.length ? nextGroups.find((g) => searchKey(g.name) === key) : undefined;
			if (!group) {
				group = { id: newId(), name: parseLabel(parsed.name, nextGroups) };
				nextGroups.push(group);
			}
			const groupId = group.id;
			for (const name of parsed.tags) {
				const tagKey = searchKey(name);
				const same = (tag: Tag, id: string | undefined) =>
					effectiveGroupId(tag, nextGroups) === id && searchKey(tag.name) === tagKey;
				if (nextTags.some((tag) => same(tag, groupId))) continue;
				const loose = nextTags.find((tag) => same(tag, undefined));
				if (loose) nextTags = nextTags.map((tag) => (tag === loose ? { ...tag, groupId } : tag));
				else nextTags.push({ id: newId(), name: parseLabel(name, []), collectionId, groupId });
			}
		} catch (error) {
			throw filled > 1 ? new Error(`Ligne ${i + 1} : ${(error as Error).message}`) : error;
		}
	});
	return { groups: nextGroups, tags: nextTags };
}

/**
 * File du mode Tagger, parmi les fiches affichées dans l'ordre : avec le filtre « Sans <catégorie> » (`group:<id>`),
 * toutes (il leur manque déjà un tag) ; sinon celles sans aucun tag. Toutes si aucune n'en manque, pour relire.
 */
export function tagQueue<T extends { id: string }>(items: T[], missingFilter: string, tagCount: (item: T) => number): string[] {
	const untagged = missingFilter.startsWith('group:') ? items : items.filter((item) => tagCount(item) === 0);
	return (untagged.length ? untagged : items).map((item) => item.id);
}
