/**
 * Fiches déchiffrées en mémoire, chargées une fois après le déverrouillage puis tenues à jour localement.
 * Vidées dès que la session est verrouillée : rien de déchiffré ne survit à la DEK.
 */
import { session } from '$lib/auth/session.svelte';
import { bytesToUrl } from './images';
import { byName, matchesSearch } from './model';
import { listEntries, type EntrySummary } from './repository';

export type ListItem = EntrySummary & { thumbUrl?: string };

let items = $state.raw<ListItem[] | null>(null);
let loading: Promise<void> | null = null;

const withThumbUrl = (entry: EntrySummary): ListItem => ({
	...entry,
	thumbUrl: entry.thumb && entry.imageType ? bytesToUrl(entry.thumb, entry.imageType) : undefined
});

const revoke = (item: ListItem | undefined) => item?.thumbUrl && URL.revokeObjectURL(item.thumbUrl);

function clear() {
	items?.forEach(revoke);
	items = null;
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
	search(query: string): ListItem[] {
		return (items ?? []).filter((item) => matchesSearch(item.name, query));
	},
	find(id: string): ListItem | undefined {
		return items?.find((item) => item.id === id);
	}
};

/** Charge la liste une seule fois par session déverrouillée. */
export function loadEntries(): Promise<void> {
	const { user, dek } = session;
	if (!user || !dek) return Promise.resolve();
	loading ??= listEntries(user.uid, dek).then(
		(list) => {
			if (session.dek === dek) items = list.map(withThumbUrl).sort(byName);
		},
		(error) => {
			loading = null; // permet de réessayer
			throw error;
		}
	);
	return loading;
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
