import { describe, expect, it } from 'vitest';
import { collectionStats } from './stats';

const groups = [
	{ id: 'g', name: 'Genre' },
	{ id: 's', name: 'Statut' }
];
const tags = [
	{ id: 'a', name: 'Action', collectionId: 'c', groupId: 'g' },
	{ id: 'd', name: 'Drame', collectionId: 'c', groupId: 'g' },
	{ id: 'f', name: 'Fini', collectionId: 'c', groupId: 's' }
];
const entries = [
	{ id: '1', country: 'FR', birthYear: 1985, rating: 9, imageType: 'image/webp', tagIds: ['a', 'f'] },
	{ id: '2', country: 'FR', birthYear: 1981, rating: 8, tagIds: ['a', 'd'], hidden: true },
	{ id: '3', country: 'JP', birthYear: 1999, rating: 1, imageType: 'image/webp', tagIds: ['supprimé'] },
	{ id: '4' }
];

describe('statistiques d’une collection', () => {
	const stats = collectionStats(entries, tags, groups, ['3', '1', 'parti']);

	it('compte les fiches et ce qui leur manque', () => {
		expect(stats).toMatchObject({ total: 4, hidden: 1, withImage: 2, rated: 3, ranked: 2 });
		// Il manque au moins une info à toutes, sauf la 1 (pays, naissance, image, Genre et Statut renseignés).
		expect(stats.incomplete).toBe(3);
	});

	it('répartit par étoiles pleines, demi-étoile vers le bas, une seule étoile au minimum', () => {
		expect(stats.ratings).toEqual([
			{ key: '4', count: 2 },
			{ key: '1', count: 1 },
			{ key: 'none', count: 1 }
		]);
	});

	it('pays du plus fréquent au moins fréquent, décennies dans l’ordre, « none » en dernier', () => {
		expect(stats.countries).toEqual([
			{ key: 'FR', count: 2 },
			{ key: 'JP', count: 1 },
			{ key: 'none', count: 1 }
		]);
		expect(stats.decades).toEqual([
			{ key: '1980', count: 2 },
			{ key: '1990', count: 1 },
			{ key: 'none', count: 1 }
		]);
	});

	it('couverture des catégories et tags les plus portés ; un tag supprimé ne compte pas', () => {
		expect(stats.categories.map(({ group, covered, top }) => [group.name, covered, top.map((t) => [t.tag.name, t.count])])).toEqual([
			['Genre', 2, [['Action', 2], ['Drame', 1]]],
			['Statut', 1, [['Fini', 1]]]
		]);
	});

	it('collection vide : rien à répartir', () => {
		expect(collectionStats([], [], [], [])).toMatchObject({ total: 0, ratings: [], countries: [], decades: [], categories: [] });
	});
});
