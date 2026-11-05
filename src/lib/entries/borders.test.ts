import { describe, expect, it } from 'vitest';
import { borderGroup, borderRing, borderTags, keepOneBorderTag } from './borders';
import type { Tag, TagGroup } from './types';

const groups: TagGroup[] = [
	{ id: 'genre', name: 'Genre' },
	{ id: 'rarete', name: 'Rareté', border: true }
];
const tags: Tag[] = [
	{ id: 'action', name: 'Action', collectionId: 'c', groupId: 'genre', color: 'red' },
	{ id: 'argent', name: 'Argent', collectionId: 'c', groupId: 'rarete', color: 'silver' },
	{ id: 'commun', name: 'Commun', collectionId: 'c', groupId: 'rarete' },
	{ id: 'or', name: 'Or', collectionId: 'c', groupId: 'rarete', color: 'gold' }
];

describe('bordure des cartes', () => {
	it('une seule catégorie de bordure, ses tags dans l’ordre du catalogue', () => {
		expect(borderGroup(groups)?.id).toBe('rarete');
		expect(borderTags(tags, groups).map((tag) => tag.id)).toEqual(['argent', 'commun', 'or']);
		expect(borderTags(tags, [{ id: 'genre', name: 'Genre' }])).toEqual([]);
	});

	it('anneau de la couleur du tag ; rien sans tag coloré ni hors de la catégorie', () => {
		expect(borderRing(['or'], tags, groups)).toBe('ring-2 ring-[#c9a227]');
		expect(borderRing(['commun'], tags, groups)).toBe('');
		// Couleur d'un tag hors de la catégorie de bordure : ignorée.
		expect(borderRing(['action'], tags, groups)).toBe('');
		expect(borderRing(undefined, tags, groups)).toBe('');
		// Fiche ancienne avec deux tags : le premier dans l'ordre de la catégorie.
		expect(borderRing(['or', 'argent'], tags, groups)).toBe('ring-2 ring-[#a7adb7]');
	});

	it('un seul tag de bordure par fiche : celui qu’on vient d’ajouter, sinon le premier', () => {
		expect(keepOneBorderTag(['action', 'argent', 'or'], tags, groups, ['or'])).toEqual(['action', 'or']);
		expect(keepOneBorderTag(['action', 'argent', 'or'], tags, groups)).toEqual(['action', 'argent']);
		expect(keepOneBorderTag(['action', 'or'], tags, groups, ['argent'])).toEqual(['action', 'or']);
	});
});
