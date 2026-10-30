/**
 * Filtres et tri de la liste : gardés pendant la session (revenir d'une fiche ne les perd pas), remis aux valeurs
 * par défaut à chaque déverrouillage : avec liens, toutes les notes, tous les pays, aucun tag, tri aléatoire.
 */
import { session } from '$lib/auth/session.svelte';
import { type CountryFilter, NO_TAG_FILTER, type RatingFilter, type SortOrder, type TagFilter } from './model';

type ListView = {
	query: string;
	tags: TagFilter;
	withLinks: boolean;
	rating: RatingFilter;
	country: CountryFilter;
	sort: SortOrder;
};

const defaults = (): ListView => ({
	query: '',
	tags: { ...NO_TAG_FILTER },
	withLinks: true,
	rating: 0,
	country: '',
	sort: 'random'
});

export const listView = $state<ListView>(defaults());

export function resetListView(): void {
	Object.assign(listView, defaults());
}

$effect.root(() => {
	$effect(() => {
		if (!session.dek) resetListView();
	});
});
