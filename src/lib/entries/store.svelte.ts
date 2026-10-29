/**
 * Fiches et tags déchiffrés en mémoire, chargés une fois après le déverrouillage puis tenus à jour localement.
 * Vidés dès que la session est verrouillée : rien de déchiffré ne survit à la DEK.
 */
import { session } from '$lib/auth/session.svelte';
import { bytesToUrl } from './images';
import { NO_TAG_FILTER, type SortOrder, type Tag, type TagFilter, byName, matchesFilter, parseTagName, sortBy } from './model';
import { listEntries, type EntrySummary } from './repository';
import { getTags, saveTags } from './tags';

export type ListItem = EntrySummary & { thumbUrl?: string };

let items = $state.raw<ListItem[] | null>(null);
let tags = $state.raw<Tag[] | null>(null);
let loading: Promise<void> | null = null;

const tagNames = $derived(new Map((tags ?? []).map((tag) => [tag.id, tag.name])));

const withThumbUrl = (entry: EntrySummary): ListItem => ({
	...entry,
	thumbUrl: entry.thumb && entry.imageType ? bytesToUrl(entry.thumb, entry.imageType) : undefined
});

const revoke = (item: ListItem | undefined) => item?.thumbUrl && URL.revokeObjectURL(item.thumbUrl);

function clear() {
	items?.forEach(revoke);
	items = null;
	tags = null;
	loading = null;
}

$effect.root(() => {
	$effect(() => {
		if (!session.dek) clear();
	});
});

export const entries = {
	get items() {
		return items;
	},
	/** Catalogue trié par nom. */
	get tags() {
		return tags;
	},
	/** `items` reste trié par nom ; un autre ordre est appliqué à la copie filtrée. */
	search(query: string, filter: TagFilter = NO_TAG_FILTER, order: SortOrder = 'name'): ListItem[] {
		const found = (items ?? []).filter((item) => matchesFilter(item, query, filter, tagNames));
		return order === 'name' ? found : found.sort(sortBy(order));
	},
	find(id: string): ListItem | undefined {
		return items?.find((item) => item.id === id);
	},
	/** Tags connus d'une fiche (les identifiants de tags supprimés sont ignorés). */
	tagsOf(entry: { tagIds?: string[] }): Tag[] {
		return (tags ?? []).filter((tag) => entry.tagIds?.includes(tag.id));
	},
	countWithTag(tagId: string): number {
		return (items ?? []).filter((item) => item.tagIds?.includes(tagId)).length;
	}
};

/** Charge fiches et tags une seule fois par session déverrouillée. */
export function loadEntries(): Promise<void> {
	const { user, dek } = session;
	if (!user || !dek) return Promise.resolve();
	loading ??= Promise.all([listEntries(user.uid, dek), getTags(user.uid, dek)]).then(
		([list, catalog]) => {
			if (session.dek !== dek) return;
			items = list.map(withThumbUrl).sort(byName);
			tags = catalog.sort(byName);
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

export function removeEntry(id: string): void {
	if (!items) return;
	revoke(items.find((item) => item.id === id));
	items = items.filter((item) => item.id !== id);
}

// ---------------------------------------------------------------------------
// Administration des tags

/** Le catalogue est réécrit en entier : il doit être chargé, sinon on écraserait les tags existants. */
function loadedTags(): Tag[] {
	if (!tags) throw new Error('Tags pas encore chargés.');
	return tags;
}

async function replaceTags(next: Tag[]): Promise<void> {
	const { user, dek } = session;
	if (!user || !dek) throw new Error('Session verrouillée.');
	await saveTags(user.uid, dek, next);
	tags = [...next].sort(byName);
}

export async function addTag(input: string): Promise<void> {
	const current = loadedTags();
	await replaceTags([...current, { id: crypto.randomUUID(), name: parseTagName(input, current) }]);
}

/** Les fiches ne stockent que l'identifiant : renommer ne touche que le catalogue. */
export async function renameTag(id: string, input: string): Promise<void> {
	const current = loadedTags();
	const name = parseTagName(input, current.filter((tag) => tag.id !== id));
	await replaceTags(current.map((tag) => (tag.id === id ? { ...tag, name } : tag)));
}

/** Retire le tag du catalogue ; les fiches qui le portent l'oublient à leur prochaine modification. */
export async function deleteTag(id: string): Promise<void> {
	await replaceTags(loadedTags().filter((tag) => tag.id !== id));
}
