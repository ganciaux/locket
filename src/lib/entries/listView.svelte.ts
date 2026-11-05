/**
 * Filtres et tri de la liste : gardés pendant la session (revenir d'une fiche ne les perd pas), remis aux valeurs
 * par défaut à chaque déverrouillage : avec liens, toutes les notes, tous les pays, validées ou non, aucun tag, tri aléatoire,
 * recherche simple (catégories de tags « avancées » masquées).
 */
import { onLock } from '$lib/auth/session.svelte';
import { type CountryFilter, NO_TAG_FILTER, type RatingFilter, type SortOrder, type TagFilter, type ValidatedFilter } from './model';

type ListView = {
	query: string;
	tags: TagFilter;
	withLinks: boolean;
	rating: RatingFilter;
	country: CountryFilter;
	validated: ValidatedFilter;
	sort: SortOrder;
	extended: boolean;
	/** Index : '' (toutes), 'any' (il manque une information) ou un `MissingField`. */
	indexMissing: string;
	/** Index : statut, à part de celui de « Mes fiches » comme « Il manque ». */
	indexValidated: ValidatedFilter;
};

const defaults = (): ListView => ({
	query: '',
	tags: { ...NO_TAG_FILTER },
	withLinks: true,
	rating: 0,
	country: [],
	validated: '',
	sort: 'random',
	extended: false,
	indexMissing: '',
	indexValidated: ''
});

export const listView = $state<ListView>(defaults());

export function resetListView(): void {
	Object.assign(listView, defaults());
}

onLock(resetListView);
